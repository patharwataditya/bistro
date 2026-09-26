package ai.synkrasis.bistro.feature.floor

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.IdempotencyKeys
import ai.synkrasis.bistro.core.ui.Effects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.ServerClock
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.Floor
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.navigation.AddItemsRoute
import ai.synkrasis.bistro.navigation.OrderRoute
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Area filter: everything, or one area (null id = tables without an area). */
sealed interface AreaFilter {
    data object All : AreaFilter
    data class One(val id: Int?, val name: String) : AreaFilter
}

/** The seat-guests sheet. Its idempotency key lives as long as the sheet (one intent). */
data class SeatDraft(val table: DiningTable, val guests: Int, val key: String = IdempotencyKeys.new())

class FloorViewModel(private val container: AppContainer) : ViewModel() {
    var state by mutableStateOf<LoadState<Floor>>(LoadState.Loading)
        private set
    var area by mutableStateOf<AreaFilter>(AreaFilter.All)
    var statusFilter by mutableStateOf<TableStatus?>(null)
    var seatDraft by mutableStateOf<SeatDraft?>(null)
    var actionsFor by mutableStateOf<DiningTable?>(null)
    var busy by mutableStateOf(false)
        private set

    val clock = ServerClock()
    val effects = Effects()
    private val refreshLock = Mutex()

    suspend fun refresh() = refreshLock.withLock {
        state = state.markRefreshing()
        val result = container.floor.floor()
        if (result is ApiResult.Success) clock.sync(result.value.serverTime)
        state = state.reduce(result)
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    /** Explicit pull: shows the indicator until the fetch lands (polling stays silent). */
    var pulling by mutableStateOf(false)
        private set

    fun pullToRefresh() {
        if (pulling) return
        pulling = true
        viewModelScope.launch {
            refresh()
            pulling = false
        }
    }

    fun onTableTapped(table: DiningTable, canSeat: Boolean) {
        val order = table.activeOrder
        when {
            order != null -> effects.navigate(OrderRoute(order.id))
            table.status.seatable && canSeat -> seatDraft = SeatDraft(table, table.capacity.coerceAtMost(2).coerceAtLeast(1))
            else -> actionsFor = table
        }
    }

    fun openTable() {
        val draft = seatDraft ?: return
        if (busy) return
        busy = true
        viewModelScope.launch {
            when (val result = container.orders.open(draft.key, draft.table.id, draft.guests)) {
                is ApiResult.Success -> {
                    seatDraft = null
                    effects.success("${draft.table.name} is open")
                    effects.navigate(OrderRoute(result.value.id))
                    effects.navigate(AddItemsRoute(result.value.id))
                    refresh()
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    refresh()
                }
            }
            busy = false
        }
    }

    fun setStatus(table: DiningTable, status: TableStatus, note: String?) {
        if (busy) return
        busy = true
        viewModelScope.launch {
            when (val result = container.floor.setStatus(table, status, note)) {
                is ApiResult.Success -> {
                    actionsFor = null
                    effects.success("${table.name} marked ${status.name.lowercase()}")
                }
                is ApiResult.Failure -> effects.error(result.error.message)
            }
            refresh()
            busy = false
        }
    }
}
