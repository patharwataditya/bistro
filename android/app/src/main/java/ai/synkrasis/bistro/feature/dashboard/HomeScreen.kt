package ai.synkrasis.bistro.feature.dashboard

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.AnimatedCounter
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.core.util.ServerClock
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.data.api.Activity
import ai.synkrasis.bistro.data.api.Dashboard
import ai.synkrasis.bistro.data.api.TableCounts
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.urgencyFor
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.BillsRoute
import ai.synkrasis.bistro.navigation.FloorRoute
import ai.synkrasis.bistro.navigation.KitchenRoute
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.ReportsRoute
import ai.synkrasis.bistro.navigation.AuditRoute
import ai.synkrasis.bistro.domain.Permission
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Restaurant
import androidx.compose.material.icons.rounded.RoomService
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalTime

class HomeViewModel(private val container: AppContainer) : ViewModel() {
    var state by mutableStateOf<LoadState<Dashboard>>(LoadState.Loading)
        private set
    val clock = ServerClock()

    suspend fun refresh() {
        state = state.markRefreshing()
        val result = container.insights.dashboard()
        if (result is ApiResult.Success) clock.sync(result.value.serverTime)
        state = state.reduce(result)
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }
}

@Composable
fun HomeScreen() {
    val vm = bistroViewModel { HomeViewModel(it) }
    val session = LocalSession.current
    PollWhileVisible(10_000) { vm.refresh() }
    val hour = LocalTime.now(session.zone).hour
    val greeting = when (hour) {
        in 5..11 -> "Good morning"
        in 12..16 -> "Good afternoon"
        else -> "Good evening"
    }
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "$greeting, ${session.me.fullName.substringBefore(' ')}",
            eyebrow = session.me.restaurantName,
            subtitle = (vm.state as? LoadState.Ready)?.data?.let { Format.date(it.businessDate) + " · " + session.me.location.name },
        )
        when (val s = vm.state) {
            LoadState.Loading -> HomeSkeleton()
            is LoadState.Failed -> ErrorState(s.error, onRetry = vm::refreshNow, modifier = Modifier.fillMaxSize())
            is LoadState.Ready -> HomeContent(s.data, s.staleError, vm)
        }
    }
}

@Composable
private fun HomeContent(d: Dashboard, stale: ai.synkrasis.bistro.core.network.AppError?, vm: HomeViewModel) {
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    val c = BistroTheme.colors
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.gutter).padding(bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        StaleBanner(stale)
        d.salesToday?.let { sales ->
            BistroCard(Modifier.fillMaxWidth(), onClick = { navigator.open(ReportsRoute) }, container = c.ink, borderColor = c.ink) {
                Text("TODAY'S NET SALES", style = BistroTheme.type.statusLabel, color = c.onInk.copy(alpha = 0.65f))
                AnimatedCounter(Format.money(sales.netSales, d.currencyCode), BistroTheme.type.amountHero, c.onInk)
                Gap(Spacing.xs)
                Text(
                    "${sales.paidBills} paid bill${if (sales.paidBills == 1) "" else "s"} · average ${Format.money(sales.averageBill, d.currencyCode)}",
                    style = BistroTheme.type.supporting, color = c.onInk.copy(alpha = 0.75f),
                )
            }
        }
        d.tables?.let { t ->
            BistroCard(Modifier.fillMaxWidth(), onClick = { navigator.open(FloorRoute) }) {
                MetricHeader(Icons.Rounded.TableRestaurant, "Floor")
                Row(verticalAlignment = Alignment.Bottom) {
                    AnimatedCounter("${t.available}", BistroTheme.type.metric, c.textPrimary)
                    Text("  of ${t.total} tables free", style = BistroTheme.type.supporting, color = c.textSecondary, modifier = Modifier.padding(bottom = 4.dp))
                }
                Gap(Spacing.md)
                FloorBar(t)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            d.kitchen?.let { k ->
                val oldestMinutes = k.oldestActiveFiredAt?.let { Duration.between(it, vm.clock.now()).toMinutes() }
                MetricTile(
                    icon = Icons.Rounded.Restaurant, label = "Kitchen", value = "${k.new + k.preparing}",
                    caption = "${k.new} new · ${k.preparing} cooking" + (oldestMinutes?.let { " · oldest ${it}m" } ?: ""),
                    tone = oldestMinutes?.let { urgencyFor(it).tone },
                    modifier = Modifier.weight(1f),
                    onClick = if (session.can(Permission.KITCHEN_VIEW)) ({ navigator.open(KitchenRoute) }) else null,
                )
            }
            d.openOrders?.let { open ->
                MetricTile(
                    icon = Icons.Rounded.RoomService, label = "Orders", value = "$open",
                    caption = if ((d.readyItems ?: 0) > 0) "${d.readyItems} items ready to serve" else "open checks",
                    tone = if ((d.readyItems ?: 0) > 0) Tone.Success else null,
                    modifier = Modifier.weight(1f),
                    onClick = if (session.can(Permission.TABLES_VIEW)) ({ navigator.open(FloorRoute) }) else null,
                )
            }
        }
        d.openBills?.let { n ->
            MetricTile(
                icon = Icons.AutoMirrored.Rounded.ReceiptLong, label = "Bills awaiting payment", value = "$n",
                caption = d.openBillsAmount?.let { Format.money(it, d.currencyCode) + " outstanding" } ?: "",
                tone = if (n > 0) Tone.Warning else null,
                modifier = Modifier.fillMaxWidth(),
                onClick = { navigator.open(BillsRoute) },
            )
        }
        d.recentActivity?.let { activity ->
            Gap(Spacing.sm)
            SectionHeader("Recent activity", action = {
                ai.synkrasis.bistro.core.designsystem.component.BistroButton(
                    "See all", { navigator.open(AuditRoute) },
                    style = ai.synkrasis.bistro.core.designsystem.component.ButtonStyle.Ghost,
                    size = ai.synkrasis.bistro.core.designsystem.component.ButtonSize.Small,
                )
            })
            if (activity.isEmpty()) {
                Text("Nothing yet today.", style = BistroTheme.type.supporting, color = c.textSecondary)
            }
            BistroCard(Modifier.fillMaxWidth(), elevated = false) {
                activity.forEachIndexed { i, a -> ActivityRow(a, vm.clock.now(), session.zone, last = i == activity.lastIndex) }
            }
        }
        if (d.tables == null && d.kitchen == null && d.salesToday == null && d.openBills == null) {
            Text("Your role doesn't include any dashboard figures.", style = BistroTheme.type.body, color = c.textSecondary)
        }
    }
}

@Composable
private fun MetricHeader(icon: ImageVector, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = BistroTheme.colors.textTertiary, modifier = Modifier.size(16.dp))
        Text("  ${label.uppercase()}", style = BistroTheme.type.statusLabel, color = BistroTheme.colors.textTertiary)
    }
}

@Composable
private fun MetricTile(
    icon: ImageVector,
    label: String,
    value: String,
    caption: String,
    tone: Tone?,
    modifier: Modifier,
    onClick: (() -> Unit)?,
) {
    val c = BistroTheme.colors
    BistroCard(modifier, onClick = onClick) {
        MetricHeader(icon, label)
        Gap(Spacing.xs)
        AnimatedCounter(value, BistroTheme.type.metric, tone?.colors()?.content ?: c.textPrimary)
        Text(caption, style = BistroTheme.type.metadata, color = c.textSecondary, maxLines = 2)
    }
}

/** Proportional bar of table statuses, with a text legend so it never relies on colour. */
@Composable
private fun FloorBar(t: TableCounts) {
    val parts = listOf(
        TableStatus.Available to t.available, TableStatus.Occupied to t.occupied, TableStatus.Reserved to t.reserved,
        TableStatus.Cleaning to t.cleaning, TableStatus.Blocked to t.blocked,
    ).filter { it.second > 0 }
    val description = parts.joinToString { "${it.second} ${it.first.visual.label.lowercase()}" }
    Column(Modifier.clearAndSetSemantics { contentDescription = description }) {
        Row(Modifier.fillMaxWidth().height(10.dp).clip(Radii.pill).background(BistroTheme.colors.surfaceSunken)) {
            parts.forEach { (status, count) ->
                val weight by animateFloatAsState(count.toFloat(), Motion.standard(), label = "bar")
                Box(Modifier.weight(weight.coerceAtLeast(0.001f)).height(10.dp).background(status.visual.tone.colors().content))
            }
        }
        Gap(Spacing.sm)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            parts.forEach { (status, count) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(Radii.pill).background(status.visual.tone.colors().content))
                    Text(" $count ${status.visual.label}", style = BistroTheme.type.metadata, color = BistroTheme.colors.textSecondary)
                }
            }
        }
    }
}

@Composable
private fun ActivityRow(a: Activity, now: java.time.Instant, zone: java.time.ZoneId, last: Boolean) {
    val c = BistroTheme.colors
    val icon = when {
        a.action.startsWith("payment") || a.action.startsWith("bill") -> Icons.Rounded.Payments
        a.action.startsWith("order") || a.action.startsWith("kitchen") -> Icons.Rounded.RoomService
        else -> Icons.Rounded.History
    }
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(32.dp).clip(Radii.sm).background(c.surfaceSunken), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = c.textSecondary, modifier = Modifier.size(16.dp))
        }
        Column(Modifier.weight(1f).padding(start = Spacing.md)) {
            Text(a.summary, style = BistroTheme.type.body, color = c.textPrimary, maxLines = 2)
            Text(
                listOfNotNull(a.actorName, Format.relative(a.createdAt, now, zone)).joinToString(" · "),
                style = BistroTheme.type.metadata, color = c.textTertiary,
            )
        }
    }
    if (!last) ai.synkrasis.bistro.core.designsystem.component.HairlineDivider()
}

@Composable
private fun HomeSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 120.dp)
        Skeleton(Modifier.fillMaxWidth(), 110.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Skeleton(Modifier.weight(1f), 110.dp)
            Skeleton(Modifier.weight(1f), 110.dp)
        }
        Skeleton(Modifier.fillMaxWidth(), 90.dp)
    }
}
