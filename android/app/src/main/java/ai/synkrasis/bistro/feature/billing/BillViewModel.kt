package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.IdempotencyKeys
import ai.synkrasis.bistro.core.ui.Effects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.PaymentMethod
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import ai.synkrasis.bistro.core.ui.Generation
import java.math.BigDecimal

/** The sheet or dialog open over the bill, if any. */
enum class BillSheet { Payment, Discount, Refund, Void }

/**
 * One money intent: its idempotency key, the bill version it was first sent against, and a
 * fingerprint of its inputs. A retry of the same inputs resends the identical request (same
 * key, same version) so a payment whose response was lost can never be charged twice; any
 * change to the inputs is a new intent with a new key.
 */
private data class MoneyIntent(val key: String, val version: Int, val fingerprint: String)

class BillViewModel(private val container: AppContainer, val billId: Int) : ViewModel() {
    var state by mutableStateOf<LoadState<Bill>>(LoadState.Loading)
        private set
    var methods by mutableStateOf<LoadState<List<PaymentMethod>>>(LoadState.Loading)
        private set
    var working by mutableStateOf<String?>(null)
        private set
    var sheet by mutableStateOf<BillSheet?>(null)
        private set

    /** Set when a payment settled the bill: the payment sheet turns into its success state. */
    var settled by mutableStateOf<Bill?>(null)
        private set

    val effects = Effects()
    private val generation = Generation()
    private var payIntent: MoneyIntent? = null
    private var refundIntent: MoneyIntent? = null

    val bill: Bill? get() = (state as? LoadState.Ready)?.data

    init {
        loadMethods()
    }

    suspend fun refresh() {
        val token = generation.current()
        val result = container.billing.get(billId)
        if (!generation.isCurrent(token)) return
        state = state.reduce(result)
        dropObsoleteIntents()
        showSettledIfPaid()
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    fun loadMethods() {
        methods = LoadState.Loading
        viewModelScope.launch {
            methods = when (val r = container.billing.paymentMethods()) {
                is ApiResult.Success -> LoadState.Ready(r.value.filter { it.isActive }.sortedWith(compareBy({ it.sortOrder }, { it.name })))
                is ApiResult.Failure -> LoadState.Failed(r.error)
            }
        }
    }

    fun open(which: BillSheet) {
        if (which == BillSheet.Payment && methods is LoadState.Failed) loadMethods()
        sheet = which
    }

    fun dismissSheet() {
        if (working != null) return
        sheet = null
        settled = null
    }

    /** Leave the success state and the screen: the bill is done. */
    fun finish() {
        sheet = null
        settled = null
        effects.back()
    }

    private fun run(
        tag: String,
        block: suspend () -> ApiResult<Bill>,
        onFailure: (AppError) -> Unit = {},
        onSuccess: suspend (Bill) -> Unit,
    ) {
        if (working != null) return
        working = tag
        viewModelScope.launch {
            when (val result = block()) {
                is ApiResult.Success -> {
                    generation.bump()
                    state = LoadState.Ready(result.value)
                    dropObsoleteIntents()
                    onSuccess(result.value)
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    onFailure(result.error)
                    if (result.error is AppError.Stale || result.error is AppError.InvalidState) refresh()
                }
            }
            working = null
        }
    }

    /**
     * A pending intent is only safe to replay while the bill is exactly as it was when the
     * intent was made. Once the bill has moved on (for instance because the "lost" request
     * actually landed), a new charge of the same amount is a *new* payment and must get a new
     * key — replaying the old one would silently return the first payment instead.
     */
    /**
     * If a payment's response was lost but a later refresh shows the bill paid, turn the open
     * payment sheet into its settled state instead of leaving a form with nothing due.
     */
    private fun showSettledIfPaid() {
        val current = bill ?: return
        if (sheet == BillSheet.Payment && settled == null && current.status != BillStatus.Open) {
            settled = current
            payIntent = null
        }
    }

    private fun dropObsoleteIntents() {
        val version = bill?.version ?: return
        if (payIntent?.version != null && payIntent?.version != version) payIntent = null
        if (refundIntent?.version != null && refundIntent?.version != version) refundIntent = null
    }

    /**
     * True when the server definitively refused the request, so replaying the same key and
     * version could only fail again. Anything else (offline, timeout, an unreadable or 5xx
     * response) may have landed, so the intent keeps its key for a safe retry.
     */
    private fun refused(error: AppError): Boolean =
        error is AppError.Stale || error is AppError.InvalidState || error is AppError.Validation ||
            error is AppError.Conflict || error is AppError.PermissionDenied || error is AppError.NotFound

    fun pay(method: PaymentMethod, amount: BigDecimal, tendered: BigDecimal?, reference: String?) {
        val current = bill ?: return
        val ref = reference?.trim()?.ifBlank { null }
        val fingerprint = listOf(current.id, method.id, amount.toPlainString(), tendered?.toPlainString(), ref).joinToString("|")
        val intent = payIntent?.takeIf { it.fingerprint == fingerprint }
            ?: MoneyIntent(IdempotencyKeys.new(), current.version, fingerprint).also { payIntent = it }
        run(
            tag = "pay",
            block = { container.billing.pay(current.copy(version = intent.version), intent.key, method.id, amount, tendered, ref) },
            onFailure = { if (refused(it)) payIntent = null },
        ) { updated ->
            payIntent = null
            if (updated.status == BillStatus.Paid) {
                settled = updated
                effects.success("Paid in full")
            } else {
                sheet = null
                effects.success(
                    "${Format.money(amount, updated.currencyCode)} received · " +
                        "${Format.money(updated.balanceDue, updated.currencyCode)} still due",
                )
            }
        }
    }

    fun settleZero() {
        val current = bill ?: return
        run("settle", { container.billing.settleZero(current) }) {
            effects.success("Bill closed")
        }
    }

    fun applyDiscount(type: DiscountType, value: BigDecimal, reason: String) {
        val current = bill ?: return
        run("discount", { container.billing.discount(current, type, value, reason) }) { updated ->
            sheet = null
            effects.success("Discount applied · new total ${Format.money(updated.total, updated.currencyCode)}")
        }
    }

    fun removeDiscount() {
        val current = bill ?: return
        run("discount-remove", { container.billing.discount(current, null, null, null) }) {
            sheet = null
            effects.success("Discount removed")
        }
    }

    fun refund(target: Refundable, amount: BigDecimal, reason: String) {
        val current = bill ?: return
        val fingerprint = listOf(current.id, target.methodId, amount.toPlainString(), reason.trim()).joinToString("|")
        val intent = refundIntent?.takeIf { it.fingerprint == fingerprint }
            ?: MoneyIntent(IdempotencyKeys.new(), current.version, fingerprint).also { refundIntent = it }
        run(
            tag = "refund",
            block = { container.billing.refund(current.copy(version = intent.version), intent.key, target.methodId, amount, reason) },
            onFailure = { if (refused(it)) refundIntent = null },
        ) { updated ->
            refundIntent = null
            sheet = null
            effects.success("Refunded ${Format.money(amount, updated.currencyCode)} to ${target.methodName}")
        }
    }

    fun void(reason: String) {
        val current = bill ?: return
        run("void", { container.billing.void(current, reason) }) {
            sheet = null
            effects.success("Bill ${current.billNumber} voided · the check is open again")
        }
    }
}
