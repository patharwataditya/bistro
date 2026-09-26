package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.IdempotencyKeys
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.PaymentMethod
import ai.synkrasis.bistro.data.api.PaymentMethodIn
import ai.synkrasis.bistro.data.api.PaymentMethodUpdate
import ai.synkrasis.bistro.data.api.RestaurantSettings
import ai.synkrasis.bistro.data.api.SettingsUpdate
import ai.synkrasis.bistro.data.api.TaxRateIn
import ai.synkrasis.bistro.data.api.TaxRatesIn
import ai.synkrasis.bistro.domain.TableStatus
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.math.BigDecimal

/** Rounding increments the server accepts, exactly as it expects them on the wire. */
val ROUNDING_OPTIONS = listOf("0.01", "0.05", "0.10", "0.25", "0.50", "1.00")

private val PERCENT_2 = Regex("^\\d{0,3}(\\.\\d{0,2})?$")
private val PERCENT_3 = Regex("^\\d{0,3}(\\.\\d{0,3})?$")
private val CURRENCY = Regex("^[A-Z]{3}$")
private val BILL_PREFIX = Regex("^[A-Z0-9-]{1,12}$")

/** Typing filters: only characters that could become a valid value get through. */
object SettingsInput {
    fun percent(text: String, decimals: Int) = text.isEmpty() || (if (decimals == 2) PERCENT_2 else PERCENT_3).matches(text)
    fun parsePercent(text: String): BigDecimal? = text.takeIf { it.isNotBlank() && it != "." }?.toBigDecimalOrNull()
        ?.takeIf { it >= BigDecimal.ZERO && it <= BigDecimal(100) }
    fun plain(value: BigDecimal): String = value.stripTrailingZeros().toPlainString()
}

@Immutable
data class GeneralForm(
    val restaurantName: String,
    val locationName: String,
    val address: String,
    val timezone: String,
    val currency: String,
    val serviceCharge: String,
    val serviceChargeTaxable: Boolean,
    val rounding: String,
    val billPrefix: String,
    val afterPayment: TableStatus,
) {
    /** Client-side checks that mirror the server's; keyed like the server's field errors. */
    fun problems(): Map<String, String> = buildMap {
        if (restaurantName.isBlank()) put("restaurant_name", "Required")
        if (locationName.isBlank()) put("location_name", "Required")
        if (timezone.isBlank()) put("timezone", "Required, e.g. Europe/London")
        if (!CURRENCY.matches(currency)) put("currency_code", "Three capital letters, e.g. USD")
        if (SettingsInput.parsePercent(serviceCharge) == null) put("service_charge_percent", "A percentage from 0 to 100")
        if (!BILL_PREFIX.matches(billPrefix)) put("bill_prefix", "1–12 capital letters, numbers or dashes")
    }

    companion object {
        fun of(s: RestaurantSettings) = GeneralForm(
            restaurantName = s.restaurantName,
            locationName = s.locationName,
            address = s.address.orEmpty(),
            timezone = s.timezone,
            currency = s.currencyCode,
            serviceCharge = SettingsInput.plain(s.serviceChargePercent),
            serviceChargeTaxable = s.serviceChargeTaxable,
            rounding = ROUNDING_OPTIONS.firstOrNull { BigDecimal(it).compareTo(s.roundingIncrement) == 0 }
                ?: s.roundingIncrement.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString(),
            billPrefix = s.billPrefix,
            afterPayment = s.statusAfterPayment,
        )
    }
}

/** One editable tax row. [key] is stable for list keys and error mapping; [id] is null for new rows. */
@Immutable
data class TaxDraft(val key: String, val id: Int?, val name: String, val rate: String, val active: Boolean) {
    fun problem(): String? = when {
        name.isBlank() -> "Name the tax"
        SettingsInput.parsePercent(rate) == null -> "Rate from 0 to 100"
        else -> null
    }
}

private fun RestaurantSettings.taxDrafts() =
    taxRates.map { TaxDraft("t-${it.id}", it.id, it.name, SettingsInput.plain(it.ratePercent), it.isActive) }

class SettingsViewModel(private val container: AppContainer) : ActionViewModel() {
    var state by mutableStateOf<LoadState<RestaurantSettings>>(LoadState.Loading)
        private set
    var general by mutableStateOf<GeneralForm?>(null)
        private set
    private var generalBase by mutableStateOf<GeneralForm?>(null)
    var taxes by mutableStateOf<List<TaxDraft>>(emptyList())
        private set
    private var taxesBase by mutableStateOf<List<TaxDraft>>(emptyList())
    var serverErrors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var addingMethod by mutableStateOf(false)

    val generalDirty: Boolean get() = general != generalBase
    val taxesDirty: Boolean get() = taxes != taxesBase
    val dirty: Boolean get() = generalDirty || taxesDirty

    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        val result = container.settings.get()
        // While someone is editing, keep the snapshot (and version) their edits started from:
        // saving then diffs against what they saw and the server reports a conflict if another
        // manager changed settings meanwhile, instead of silently reverting that change.
        if (dirty && state is LoadState.Ready && result is ApiResult.Success) return@withLock
        state = state.reduce(result)
        if (result is ApiResult.Success) adopt(result.value, keepEdits = false)
    }

    /** Take the server copy as the new baseline; unsaved edits survive background refreshes. */
    private fun adopt(s: RestaurantSettings, keepEdits: Boolean) {
        val g = GeneralForm.of(s)
        val t = s.taxDrafts()
        if (!keepEdits || !generalDirty) general = g
        if (!keepEdits || !taxesDirty) taxes = t
        generalBase = g
        taxesBase = t
    }

    fun editGeneral(transform: (GeneralForm) -> GeneralForm) {
        general = general?.let(transform)
        serverErrors = emptyMap()
    }

    fun editTax(key: String, transform: (TaxDraft) -> TaxDraft) {
        taxes = taxes.map { if (it.key == key) transform(it) else it }
        serverErrors = emptyMap()
    }

    fun addTax() {
        if (taxes.size >= 10) return
        taxes = taxes + TaxDraft("n-${IdempotencyKeys.new()}", null, "", "", true)
    }

    fun removeTax(key: String) {
        taxes = taxes.filterNot { it.key == key }
    }

    fun discard() {
        general = generalBase
        taxes = taxesBase
        serverErrors = emptyMap()
    }

    val canSave: Boolean
        get() = general?.problems().isNullOrEmpty() && taxes.all { it.problem() == null }

    fun save() {
        val current = state.dataOrNull ?: return
        val form = general ?: return
        act("save", { saveAll(current, form) }, onFailure = { error ->
            serverErrors = error.fieldErrors()
            // A stale version means someone else saved: show their settings, not ours.
            if (error is AppError.Stale) {
                general = null
                generalBase = null
                taxes = emptyList()
                taxesBase = emptyList()
            }
        }) { saved ->
            val profileChanged = saved.timezone != current.timezone || saved.currencyCode != current.currencyCode ||
                saved.locationName != current.locationName || saved.restaurantName != current.restaurantName
            state = LoadState.Ready(saved)
            adopt(saved, keepEdits = false)
            effects.success("Settings saved")
            if (profileChanged) viewModelScope.launch { runCatching { container.session.reloadProfile() } }
        }
    }

    private suspend fun saveAll(start: RestaurantSettings, form: GeneralForm): ApiResult<RestaurantSettings> {
        var current = start
        if (generalDirty) {
            when (val r = container.settings.update(changes(current, form))) {
                is ApiResult.Failure -> return r
                is ApiResult.Success -> {
                    current = r.value
                    // General part is saved even if the tax table fails next.
                    state = LoadState.Ready(current)
                    generalBase = GeneralForm.of(current)
                    general = generalBase
                }
            }
        }
        if (taxesDirty) {
            val body = TaxRatesIn(
                current.version,
                taxes.map { TaxRateIn(it.id, it.name.trim(), SettingsInput.parsePercent(it.rate) ?: BigDecimal.ZERO, it.active) },
            )
            return container.settings.replaceTaxes(body)
        }
        return ApiResult.Success(current)
    }

    /** Only fields that actually changed; nulls are omitted from the request. */
    private fun changes(s: RestaurantSettings, f: GeneralForm): SettingsUpdate {
        val charge = SettingsInput.parsePercent(f.serviceCharge)
        return SettingsUpdate(
            version = s.version,
            restaurantName = f.restaurantName.trim().takeIf { it != s.restaurantName },
            locationName = f.locationName.trim().takeIf { it != s.locationName },
            address = f.address.trim().takeIf { it != s.address.orEmpty() },
            timezone = f.timezone.trim().takeIf { it != s.timezone },
            currencyCode = f.currency.takeIf { it != s.currencyCode },
            serviceChargePercent = charge?.takeIf { it.compareTo(s.serviceChargePercent) != 0 },
            serviceChargeTaxable = f.serviceChargeTaxable.takeIf { it != s.serviceChargeTaxable },
            roundingIncrement = BigDecimal(f.rounding).takeIf { it.compareTo(s.roundingIncrement) != 0 },
            billPrefix = f.billPrefix.takeIf { it != s.billPrefix },
            statusAfterPayment = f.afterPayment.takeIf { it != s.statusAfterPayment },
        )
    }

    /** Error for a tax row from the server's "tax_rates.<index>.<field>" keys. */
    fun taxError(index: Int): String? =
        serverErrors.entries.firstOrNull { it.key.startsWith("tax_rates.$index.") }?.value

    private fun replaceMethod(updated: PaymentMethod) {
        val s = state.dataOrNull ?: return
        val list = s.paymentMethods.map { if (it.id == updated.id) updated else it }
            .let { if (it.none { m -> m.id == updated.id }) it + updated else it }
        state = LoadState.Ready(s.copy(paymentMethods = list))
    }

    fun setMethodActive(method: PaymentMethod, active: Boolean) = act(
        "pm-${method.id}",
        { container.settings.updatePaymentMethod(method.id, PaymentMethodUpdate(isActive = active)) },
    ) { updated ->
        replaceMethod(updated)
        effects.success(if (active) "${updated.name} can be used again" else "${updated.name} hidden at checkout")
    }

    fun setMethodCash(method: PaymentMethod, cash: Boolean) = act(
        "pm-${method.id}",
        { container.settings.updatePaymentMethod(method.id, PaymentMethodUpdate(isCash = cash)) },
    ) { updated -> replaceMethod(updated) }

    fun addMethod(name: String, cash: Boolean) {
        val nextSort = (state.dataOrNull?.paymentMethods?.maxOfOrNull { it.sortOrder } ?: -1) + 1
        act(
            "pm-new",
            { container.settings.createPaymentMethod(PaymentMethodIn(name.trim(), isCash = cash, sortOrder = nextSort.coerceAtMost(1000))) },
        ) { created ->
            replaceMethod(created)
            addingMethod = false
            effects.success("${created.name} added")
        }
    }
}
