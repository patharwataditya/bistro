package ai.synkrasis.bistro.feature.kitchen

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.map
import ai.synkrasis.bistro.core.ui.Effects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.ServerClock
import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.domain.TicketStatus
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import ai.synkrasis.bistro.core.ui.Generation

class KitchenViewModel(private val container: AppContainer) : ViewModel() {
    var state by mutableStateOf<LoadState<List<Ticket>>>(LoadState.Loading)
        private set

    /** Lane shown on phones; wide screens show every lane at once. */
    var lane by mutableStateOf(Lane.New)

    /**
     * Tickets with a transition in flight. A kitchen has several cooks bumping different
     * tickets at once, so this is per ticket rather than one screen-wide `working` tag: a
     * ticket's own buttons are locked (no double submit) while the rest stay responsive.
     */
    var busy by mutableStateOf<Set<Int>>(emptySet())
        private set

    val clock = ServerClock()
    val effects = Effects()
    private val generation = Generation()

    suspend fun refresh() {
        val token = generation.current()
        val result = container.kitchen.board()
        if (result is ApiResult.Success) clock.sync(result.value.serverTime)
        if (!generation.isCurrent(token)) return
        generation.bump()
        state = state.reduce(result.map { it.tickets })
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    /**
     * Moves a ticket to its next state. The board isn't changed optimistically: the ticket is
     * replaced in place with the server's answer, so what the pass sees is always true.
     */
    fun transition(ticket: Ticket, to: TicketStatus, onDone: () -> Unit = {}) {
        if (ticket.id in busy) return
        busy = busy + ticket.id
        viewModelScope.launch {
            when (val result = container.kitchen.transition(ticket, to)) {
                is ApiResult.Success -> {
                    replace(result.value)
                    if (to == TicketStatus.Completed) {
                        effects.success("${result.value.tableName} · ticket ${result.value.ticketNumber} served")
                    } else {
                        onDone()
                    }
                }
                is ApiResult.Failure -> {
                    effects.error(result.error.message)
                    if (result.error is AppError.Stale || result.error is AppError.InvalidState) refresh()
                }
            }
            busy = busy - ticket.id
        }
    }

    private fun replace(updated: Ticket) {
        generation.bump()
        val ready = state as? LoadState.Ready ?: return
        val list = ready.data
        state = ready.copy(
            data = if (list.any { it.id == updated.id }) {
                list.map { if (it.id == updated.id) updated else it }
            } else {
                list + updated
            },
        )
    }
}
