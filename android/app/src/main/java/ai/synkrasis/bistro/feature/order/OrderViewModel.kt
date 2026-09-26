package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.IdempotencyKeys
import ai.synkrasis.bistro.core.ui.Effects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.Order
import ai.synkrasis.bistro.data.api.OrderItem
import ai.synkrasis.bistro.navigation.BillRoute
import ai.synkrasis.bistro.navigation.OrderRoute
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ai.synkrasis.bistro.core.ui.Generation

/** Which table-picking flow is open, if any. */
enum class TablePick { Move, Merge, Split }

class OrderViewModel(private val container: AppContainer, val orderId: Int) : ViewModel() {
    var state by mutableStateOf<LoadState<Order>>(LoadState.Loading)
        private set
    /** Name of the action in flight ("fire", "bill", "item-12"…); disables its button. */
    var working by mutableStateOf<String?>(null)
        private set

    var voidTarget by mutableStateOf<OrderItem?>(null)
    var noteTarget by mutableStateOf<OrderItem?>(null)
    var confirmCancel by mutableStateOf(false)
    var editGuests by mutableStateOf(false)
    var tablePick by mutableStateOf<TablePick?>(null)
    var splitSelection by mutableStateOf<Set<Int>>(emptySet())
    var pickerTables by mutableStateOf<LoadState<List<DiningTable>>>(LoadState.Loading)
        private set

    val effects = Effects()
    private val generation = Generation()

    // One key per intent, reused if the same action is retried after a lost response.
    // (version, key): a key is only reused for a retry against the same order version.
    private var fireKey: Pair<Int, String>? = null
    private var billKey: Pair<Int, String>? = null

    private fun keyFor(current: Pair<Int, String>?, version: Int): Pair<Int, String> =
        current?.takeIf { it.first == version } ?: (version to IdempotencyKeys.new())

    private val order: Order? get() = (state as? LoadState.Ready)?.data

    suspend fun refresh() {
        val token = generation.current()
        val result = container.orders.get(orderId)
        if (generation.isCurrent(token)) {
            generation.bump()
            state = state.reduce(result)
        }
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    private fun run(tag: String, block: suspend () -> ApiResult<*>, onSuccess: suspend (Any?) -> Unit = {}) {
        if (working != null) return
        working = tag
        viewModelScope.launch {
            when (val result = block()) {
                is ApiResult.Success -> {
                    val value = result.value
                    if (value is Order && value.id == orderId) {
                        generation.bump()
                        state = LoadState.Ready(value)
                    }
                    onSuccess(value)
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    if (result.error is AppError.Stale || result.error is AppError.InvalidState) {
                        refresh()
                        // The picker's snapshot (e.g. a merge source's version) is stale too.
                        tablePick?.let { openPicker(it, keepSelection = true) }
                    }
                }
            }
            working = null
        }
    }

    /** Quantities typed on the stepper but not yet confirmed by the server. */
    var draftQuantities by mutableStateOf<Map<Int, Int>>(emptyMap())
        private set
    private val quantityJobs = mutableMapOf<Int, Job>()

    /**
     * Every tap counts: the stepper updates locally at once and the final value is sent once
     * the taps stop (debounced), rather than dropping taps while a request is in flight.
     */
    fun setQuantity(item: OrderItem, quantity: Int) {
        draftQuantities = draftQuantities + (item.id to quantity)
        quantityJobs.remove(item.id)?.cancel()
        quantityJobs[item.id] = viewModelScope.launch {
            delay(400)
            val target = draftQuantities[item.id] ?: return@launch
            val result = container.orders.updateItem(orderId, item.id, target, null)
            quantityJobs.remove(item.id)
            if (draftQuantities[item.id] == target) draftQuantities = draftQuantities - item.id
            when (result) {
                is ApiResult.Success -> {
                    generation.bump()
                    state = LoadState.Ready(result.value)
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    refresh()
                }
            }
        }
    }

    fun removeItem(item: OrderItem) = run("item-${item.id}", { container.orders.removeItem(orderId, item.id) }) {
        noteTarget = null
        effects.info("${item.name} removed")
    }

    fun setNote(item: OrderItem, note: String) = run("item-${item.id}", {
        container.orders.updateItem(orderId, item.id, null, note.trim())
    }) { noteTarget = null }

    /**
     * Send any stepper changes still waiting on their debounce, right now. Returns the latest
     * order (or a failure) so an action that follows uses the true quantities and version.
     */
    private suspend fun flushQuantities(): ApiResult<Order>? {
        if (draftQuantities.isEmpty()) return null
        quantityJobs.values.forEach { it.cancel() }
        quantityJobs.clear()
        var last: ApiResult<Order>? = null
        for ((itemId, target) in draftQuantities) {
            last = container.orders.updateItem(orderId, itemId, target, null)
            if (last is ApiResult.Failure) break
        }
        draftQuantities = emptyMap()
        (last as? ApiResult.Success)?.let {
            generation.bump()
            state = LoadState.Ready(it.value)
        }
        return last
    }

    fun fire() {
        run("fire", {
            // The kitchen must get what the screen shows, including taps from the last 400 ms.
            val flushed = flushQuantities()
            if (flushed is ApiResult.Failure) return@run flushed
            val current = order ?: return@run ApiResult.Failure(AppError.Unexpected())
            val key = keyFor(fireKey, current.version).also { fireKey = it }.second
            container.orders.fire(orderId, current.version, key)
        }) {
            fireKey = null
            effects.success("Sent to the kitchen")
        }
    }

    fun serve(item: OrderItem) = run("item-${item.id}", { container.orders.serveItem(orderId, item.id) }) {
        effects.success("${item.name} served")
    }

    fun void(item: OrderItem, reason: String) = run("void", { container.orders.voidItem(orderId, item.id, reason) }) {
        voidTarget = null
        effects.success("${item.name} voided")
    }

    fun createBill() {
        val current = order ?: return
        val key = keyFor(billKey, current.version).also { billKey = it }.second
        run("bill", { container.billing.create(key, orderId, current.version) }) { bill ->
            billKey = null
            refresh()
            (bill as? ai.synkrasis.bistro.data.api.Bill)?.let { effects.navigate(BillRoute(it.id)) }
        }
    }

    fun updateGuests(guests: Int) {
        val current = order ?: return
        run("guests", { container.orders.update(orderId, current.version, guests, null) }) { editGuests = false }
    }

    /** Leaving the screen mid-debounce must not lose the edit: finish it on the app scope. */
    override fun onCleared() {
        val pending = draftQuantities
        if (pending.isEmpty()) return
        quantityJobs.values.forEach { it.cancel() }
        container.appScope.launch {
            pending.forEach { (itemId, target) -> container.orders.updateItem(orderId, itemId, target, null) }
        }
    }

    fun cancel(reason: String) {
        val current = order ?: return
        run("cancel", { container.orders.cancel(orderId, current.version, reason) }) {
            confirmCancel = false
            effects.success("Order cancelled")
            effects.back()
        }
    }

    var splitGuests by mutableIntStateOf(1)

    fun openPicker(kind: TablePick, keepSelection: Boolean = false) {
        tablePick = kind
        if (kind == TablePick.Split && !keepSelection) {
            splitSelection = emptySet()
            splitGuests = 1
        }
        pickerTables = LoadState.Loading
        viewModelScope.launch {
            pickerTables = when (val r = container.floor.floor()) {
                is ApiResult.Success -> LoadState.Ready(r.value.tables)
                is ApiResult.Failure -> LoadState.Failed(r.error)
            }
        }
    }

    /** Move and merge need a confirmation: a merge can't be undone. */
    var confirmPick by mutableStateOf<DiningTable?>(null)

    fun pickTable(table: DiningTable) {
        if (tablePick != TablePick.Split && confirmPick?.id != table.id) {
            confirmPick = table
            return
        }
        confirmPick = null
        val current = order ?: return
        when (tablePick) {
            TablePick.Move -> run("move", { container.orders.transfer(orderId, current.version, table.id) }) {
                tablePick = null
                effects.success("Moved to ${table.name}")
            }
            TablePick.Merge -> {
                val source = table.activeOrder ?: return
                run("merge", { container.orders.merge(orderId, current.version, source.id, source.version) }) {
                    tablePick = null
                    effects.success("${table.name} merged into this order")
                }
            }
            TablePick.Split -> run("split", {
                container.orders.split(orderId, current.version, table.id, splitSelection.toList(), splitGuests)
            }) { newOrder ->
                tablePick = null
                refresh()
                effects.success("Split to ${table.name}")
                (newOrder as? Order)?.let { effects.navigate(OrderRoute(it.id)) }
            }
            null -> Unit
        }
    }
}
