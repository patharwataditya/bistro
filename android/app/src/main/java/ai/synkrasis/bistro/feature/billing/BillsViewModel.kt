package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.map
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.BillSummary
import ai.synkrasis.bistro.domain.BillStatus
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import java.time.ZoneId

enum class BillsFilter(val label: String, val statuses: List<BillStatus>) {
    Open("Open", listOf(BillStatus.Open)),
    PaidToday("Paid today", listOf(BillStatus.Paid, BillStatus.PartiallyRefunded, BillStatus.Refunded)),
    Void("Void", listOf(BillStatus.Void)),
}

class BillsViewModel(private val container: AppContainer, private val zone: ZoneId) : ViewModel() {
    var filter by mutableStateOf(BillsFilter.Open)
        private set
    var state by mutableStateOf<LoadState<List<BillSummary>>>(LoadState.Loading)
        private set

    private val lock = Mutex()

    fun select(f: BillsFilter) {
        if (f == filter && state !is LoadState.Failed) return
        filter = f
        state = LoadState.Loading
        viewModelScope.launch { refresh() }
    }

    fun retry() = select(filter)

    suspend fun refresh() = lock.withLock {
        val requested = filter
        state = state.markRefreshing()
        // "Paid today" asks the server for bills settled since local midnight in the
        // restaurant's time zone, newest settlement first.
        val paidSince = if (requested == BillsFilter.PaidToday) LocalDate.now(zone).atStartOfDay(zone).toInstant() else null
        val result = container.billing.list(requested.statuses, limit = 200, paidSince = paidSince).map { it.items }
        if (requested != filter) return@withLock
        state = state.reduce(result)
    }
}
