package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.SegmentedControl
import ai.synkrasis.bistro.core.designsystem.component.SkeletonList
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.OrderSummary
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.OrderRoute
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import java.time.Instant

enum class OrdersFilter(val label: String, val statuses: List<OrderStatus>) {
    Active("Active", listOf(OrderStatus.Open, OrderStatus.Billed)),
    Closed("Closed", listOf(OrderStatus.Closed)),
    Cancelled("Cancelled", listOf(OrderStatus.Cancelled, OrderStatus.Merged)),
}

class OrdersViewModel(private val container: AppContainer) : ViewModel() {
    var filter by mutableStateOf(OrdersFilter.Active)
        private set
    var state by mutableStateOf<LoadState<List<OrderSummary>>>(LoadState.Loading)
        private set

    fun select(f: OrdersFilter) {
        filter = f
        state = LoadState.Loading
        viewModelScope.launch { refresh() }
    }

    suspend fun refresh() {
        val requested = filter
        state = state.markRefreshing()
        val result = container.orders.list(requested.statuses, limit = 100)
        if (requested != filter) return
        state = state.reduce(
            when (result) {
                is ApiResult.Success -> ApiResult.Success(result.value.items)
                is ApiResult.Failure -> result
            },
        )
    }
}

@Composable
fun OrdersScreen() {
    val vm = bistroViewModel { OrdersViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    PollWhileVisible(15_000) { vm.refresh() }
    Column(Modifier.fillMaxSize()) {
        BistroTopBar("Orders", onBack = navigator::back, subtitle = "Active and recent checks")
        SegmentedControl(OrdersFilter.entries, vm.filter, vm::select, { it.label }, Modifier.padding(horizontal = Spacing.gutter))
        when (val s = vm.state) {
            LoadState.Loading -> SkeletonList()
            is LoadState.Failed -> ErrorState(s.error, { vm.select(vm.filter) }, Modifier.fillMaxSize())
            is LoadState.Ready -> LazyColumn(
                contentPadding = PaddingValues(Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                item { StaleBanner(s.staleError) }
                if (s.data.isEmpty()) {
                    item {
                        EmptyState(Icons.Rounded.ReceiptLong, "No ${vm.filter.label.lowercase()} orders", when (vm.filter) {
                            OrdersFilter.Active -> "Seat a table from the floor to start a check."
                            OrdersFilter.Closed -> "Paid checks will show up here."
                            OrdersFilter.Cancelled -> "Nothing has been cancelled. Good."
                        })
                    }
                }
                items(s.data, key = { it.id }) { o ->
                    BistroCard(
                        Modifier.fillMaxWidth().animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
                        onClick = { navigator.open(OrderRoute(o.id)) }, elevated = false,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Table ${o.tableName}", style = BistroTheme.type.cardTitle, color = BistroTheme.colors.textPrimary)
                                Text(
                                    "#${o.orderNumber} · ${o.guestCount} guests · ${o.serverName} · ${Format.relative(o.openedAt, Instant.now(), session.zone)}",
                                    style = BistroTheme.type.metadata, color = BistroTheme.colors.textSecondary,
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(Format.money(o.subtotal, session.currency), style = BistroTheme.type.amount, color = BistroTheme.colors.textPrimary)
                                val v = o.status.visual
                                StatusChip(v.label, v.tone)
                            }
                        }
                    }
                }
            }
        }
    }
}
