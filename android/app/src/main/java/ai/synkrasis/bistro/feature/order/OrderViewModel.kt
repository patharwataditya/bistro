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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
    private val lock = Mutex()

    // One key per intent, reused if the same action is retried after a lost response.
    private var fireKey: String? = null
    private var billKey: String? = null

    private val order: Order? get() = (state as? LoadState.Ready)?.data

    suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        state = state.reduce(container.orders.get(orderId))
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
                    if (value is Order && value.id == orderId) lock.withLock { state = LoadState.Ready(value) }
                    onSuccess(value)
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    if (result.error is AppError.Stale || result.error is AppError.InvalidState) refresh()
                }
            }
            working = null
        }
    }

    fun setQuantity(item: OrderItem, quantity: Int) = run("item-${item.id}", {
        if (quantity <= 0) container.orders.removeItem(orderId, item.id) else container.orders.updateItem(orderId, item.id, quantity, null)
    })

    fun setNote(item: OrderItem, note: String) = run("item-${item.id}", {
        container.orders.updateItem(orderId, item.id, null, note.trim())
    }) { noteTarget = null }

    fun fire() {
        val current = order ?: return
        val key = fireKey ?: IdempotencyKeys.new().also { fireKey = it }
        run("fire", { container.orders.fire(orderId, current.version, key) }) {
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
        val key = billKey ?: IdempotencyKeys.new().also { billKey = it }
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

    fun cancel(reason: String) {
        val current = order ?: return
        run("cancel", { container.orders.cancel(orderId, current.version, reason) }) {
            confirmCancel = false
            effects.success("Order cancelled")
            effects.back()
        }
    }

    fun openPicker(kind: TablePick) {
        tablePick = kind
        if (kind == TablePick.Split) splitSelection = emptySet()
        pickerTables = LoadState.Loading
        viewModelScope.launch {
            pickerTables = when (val r = container.floor.floor()) {
                is ApiResult.Success -> LoadState.Ready(r.value.tables)
                is ApiResult.Failure -> LoadState.Failed(r.error)
            }
        }
    }

    fun pickTable(table: DiningTable) {
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
                container.orders.split(orderId, current.version, table.id, splitSelection.toList(), 1)
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
