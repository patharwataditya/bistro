package ai.synkrasis.bistro.feature.reports

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.DailySales
import ai.synkrasis.bistro.data.api.HourlySales
import ai.synkrasis.bistro.data.api.NamedAmount
import ai.synkrasis.bistro.data.api.Report
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.ZoneId

enum class RangePreset(val label: String) { Today("Today"), Yesterday("Yesterday"), Week("Last 7 days"), Month("This month"), Days30("Last 30 days") }

fun RangePreset.dates(today: LocalDate): Pair<LocalDate, LocalDate> = when (this) {
    RangePreset.Today -> today to today
    RangePreset.Yesterday -> today.minusDays(1) to today.minusDays(1)
    RangePreset.Week -> today.minusDays(6) to today
    RangePreset.Month -> today.withDayOfMonth(1) to today
    RangePreset.Days30 -> today.minusDays(29) to today
}

class ReportsViewModel(private val container: AppContainer, private val zone: ZoneId) : ViewModel() {
    var preset by mutableStateOf(RangePreset.Today)
        private set
    var state by mutableStateOf<LoadState<Report>>(LoadState.Loading)
        private set
    private var job: Job? = null

    init {
        load()
    }

    fun select(p: RangePreset) {
        preset = p
        load()
    }

    fun load() {
        job?.cancel()
        state = LoadState.Loading
        val (start, end) = preset.dates(LocalDate.now(zone))
        job = viewModelScope.launch {
            state = when (val r = container.insights.report(start, end)) {
                is ApiResult.Success -> LoadState.Ready(r.value)
                is ApiResult.Failure -> LoadState.Failed(r.error)
            }
        }
    }
}

@Composable
fun ReportsScreen() {
    ai.synkrasis.bistro.core.ui.SecureScreen()
    val session = LocalSession.current
    val vm = bistroViewModel { ReportsViewModel(it, session.zone) }
    val navigator = LocalNavigator.current
    Column(Modifier.fillMaxSize()) {
        BistroTopBar("Reports", onBack = navigator::back, subtitle = session.me.location.name)
        ChipRow(RangePreset.entries, vm.preset, vm::select, { it.label })
        Gap(Spacing.md)
        AnimatedContent(
            targetState = vm.state,
            contentKey = { it::class to vm.preset },
            transitionSpec = { fadeIn(Motion.standard()) togetherWith fadeOut(Motion.fast()) },
            label = "report",
        ) { s ->
            when (s) {
                LoadState.Loading -> ReportSkeleton()
                is LoadState.Failed -> ErrorState(s.error, vm::load, Modifier.fillMaxSize())
                is LoadState.Ready -> ReportContent(s.data)
            }
        }
    }
}

@Composable
private fun ReportContent(r: Report) {
    val c = BistroTheme.colors
    val cur = r.currencyCode
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.gutter).padding(bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            if (r.startDate == r.endDate) Format.date(r.startDate) else "${Format.date(r.startDate)} – ${Format.date(r.endDate)}",
            style = BistroTheme.type.supporting, color = c.textSecondary,
        )
        BistroCard(Modifier.fillMaxWidth(), container = c.ink, borderColor = c.ink) {
            Text("NET SALES", style = BistroTheme.type.statusLabel, color = c.onInk.copy(alpha = 0.65f))
            Text(Format.money(r.netSales, cur), style = BistroTheme.type.amountHero, color = c.onInk)
            Text(
                "Gross ${Format.money(r.grossSales, cur)} · refunds ${Format.money(r.refunds, cur)}",
                style = BistroTheme.type.supporting, color = c.onInk.copy(alpha = 0.75f),
            )
        }
        if (r.orderCount == 0 && r.cancelledOrders == 0) {
            EmptyState(Icons.Rounded.Insights, "No sales in this period", "Settled bills will appear here. Try a longer range.")
            return@Column
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Kpi("Bills", "${r.orderCount}", Modifier.weight(1f))
            Kpi("Average bill", Format.money(r.averageOrderValue, cur), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Kpi("Guests", "${r.guests}", Modifier.weight(1f))
            Kpi("Discounts", Format.money(r.discountsTotal, cur), Modifier.weight(1f), "${r.discountedBills} bills")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Kpi("Cancelled", "${r.cancelledOrders}", Modifier.weight(1f), "orders")
            Kpi("Voided items", Format.money(r.voidedItemsValue, cur), Modifier.weight(1f))
        }
        if (r.daily.size > 1) {
            SectionHeader("Net sales by day")
            BistroCard(Modifier.fillMaxWidth(), elevated = false) { DailyChart(r.daily, cur) }
        }
        SectionHeader("When bills are settled", subtitle = "Gross sales by hour")
        BistroCard(Modifier.fillMaxWidth(), elevated = false) { HourlyChart(r.hourly, cur) }
        if (r.topItems.isNotEmpty()) {
            SectionHeader("Top sellers")
            BistroCard(Modifier.fillMaxWidth(), elevated = false) {
                val max = r.topItems.maxOf { it.quantity }.coerceAtLeast(1)
                r.topItems.forEach { item ->
                    RankRow(item.name, "${item.quantity} sold", Format.money(item.revenue, cur), item.quantity.toFloat() / max)
                }
            }
        }
        if (r.paymentMethods.isNotEmpty()) {
            SectionHeader("Payment methods", subtitle = "Money taken, net of refunds")
            BistroCard(Modifier.fillMaxWidth(), elevated = false) { Breakdown(r.paymentMethods, cur, "payments") }
        }
        if (r.tables.isNotEmpty()) {
            SectionHeader("Tables")
            BistroCard(Modifier.fillMaxWidth(), elevated = false) {
                val max = r.tables.maxOf { it.revenue }.takeIf { it.signum() > 0 } ?: BigDecimal.ONE
                r.tables.take(10).forEach { t ->
                    RankRow("Table ${t.tableName}", "${t.orders} checks · avg ${t.averageMinutes} min", Format.money(t.revenue, cur), ratio(t.revenue, max))
                }
            }
        }
        if (r.staff.isNotEmpty()) {
            SectionHeader("Staff", subtitle = "Checks served and gross sales")
            BistroCard(Modifier.fillMaxWidth(), elevated = false) { Breakdown(r.staff, cur, "checks") }
        }
        SectionHeader("Taxes & service")
        BistroCard(Modifier.fillMaxWidth(), elevated = false) {
            ai.synkrasis.bistro.feature.common.AmountLine("Taxes collected", Format.money(r.taxTotal, cur))
            ai.synkrasis.bistro.feature.common.AmountLine("Service charge", Format.money(r.serviceChargeTotal, cur))
        }
    }
}

private fun ratio(value: BigDecimal, max: BigDecimal): Float =
    if (max.signum() == 0) 0f else value.divide(max, 4, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)

@Composable
private fun Kpi(label: String, value: String, modifier: Modifier, caption: String? = null) {
    val c = BistroTheme.colors
    BistroCard(modifier, elevated = false) {
        Text(label.uppercase(), style = BistroTheme.type.statusLabel, color = c.textTertiary)
        Text(value, style = BistroTheme.type.amountLarge, color = c.textPrimary, maxLines = 1)
        if (caption != null) Text(caption, style = BistroTheme.type.metadata, color = c.textSecondary)
    }
}

@Composable
private fun RankRow(title: String, caption: String, amount: String, fraction: Float) {
    val c = BistroTheme.colors
    val anim = remember { Animatable(0f) }
    LaunchedEffect(fraction) { anim.animateTo(fraction, Motion.enter()) }
    Column(Modifier.fillMaxWidth().padding(vertical = Spacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = BistroTheme.type.bodyStrong, color = c.textPrimary, maxLines = 1)
                Text(caption, style = BistroTheme.type.metadata, color = c.textSecondary)
            }
            Text(amount, style = BistroTheme.type.amount, color = c.textPrimary)
        }
        Gap(6.dp)
        Box(Modifier.fillMaxWidth().height(6.dp).clip(Radii.pill).background(c.surfaceSunken)) {
            Box(Modifier.fillMaxWidth(anim.value.coerceAtLeast(0.01f)).height(6.dp).clip(Radii.pill).background(c.accent))
        }
    }
}

@Composable
private fun Breakdown(rows: List<NamedAmount>, cur: String, countLabel: String) {
    val total = rows.fold(BigDecimal.ZERO) { a, r -> a + r.amount.max(BigDecimal.ZERO) }
    rows.forEach { row ->
        val share = if (total.signum() == 0) 0f else ratio(row.amount.max(BigDecimal.ZERO), total)
        RankRow(row.name, "${row.count} $countLabel · ${(share * 100).toInt()}%", Format.money(row.amount, cur), share)
    }
}

@Composable
private fun DailyChart(days: List<DailySales>, cur: String) {
    val c = BistroTheme.colors
    val max = days.maxOf { it.netSales }.takeIf { it.signum() > 0 } ?: BigDecimal.ONE
    val best = days.maxBy { it.netSales }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(days) { progress.snapTo(0f); progress.animateTo(1f, Motion.enter()) }
    val description = "Daily net sales. Best day ${Format.date(best.date)} with ${Format.money(best.netSales, cur)}."
    Column(Modifier.clearAndSetSemantics { contentDescription = description }) {
        Canvas(Modifier.fillMaxWidth().height(140.dp)) {
            val gap = 4.dp.toPx()
            val barW = ((size.width - gap * (days.size - 1)) / days.size).coerceAtLeast(1f)
            days.forEachIndexed { i, d ->
                val h = (ratio(d.netSales.max(BigDecimal.ZERO), max) * size.height * progress.value).coerceAtLeast(if (d.netSales.signum() > 0) 2f else 0f)
                drawRoundRect(
                    color = if (d == best) c.accent else c.borderStrong,
                    topLeft = Offset(i * (barW + gap), size.height - h),
                    size = Size(barW, h),
                    cornerRadius = CornerRadius(3.dp.toPx()),
                )
            }
        }
        Gap(Spacing.sm)
        Row {
            Text(Format.date(days.first().date), style = BistroTheme.type.metadata, color = c.textTertiary, modifier = Modifier.weight(1f))
            Text(Format.date(days.last().date), style = BistroTheme.type.metadata, color = c.textTertiary)
        }
    }
}

@Composable
private fun HourlyChart(hours: List<HourlySales>, cur: String) {
    val c = BistroTheme.colors
    val max = hours.maxOf { it.sales }.takeIf { it.signum() > 0 } ?: BigDecimal.ONE
    val peak = hours.maxBy { it.sales }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(hours) { progress.snapTo(0f); progress.animateTo(1f, Motion.enter()) }
    val description = if (peak.sales.signum() > 0) "Busiest hour ${peak.hour}:00 with ${Format.money(peak.sales, cur)}." else "No sales by hour."
    Column(Modifier.clearAndSetSemantics { contentDescription = description }) {
        Canvas(Modifier.fillMaxWidth().height(96.dp)) {
            val gap = 2.dp.toPx()
            val barW = (size.width - gap * 23) / 24
            hours.forEach { h ->
                val height = (ratio(h.sales, max) * size.height * progress.value)
                drawRoundRect(
                    color = if (h == peak && h.sales.signum() > 0) c.accent else c.info.copy(alpha = 0.55f),
                    topLeft = Offset(h.hour * (barW + gap), size.height - height),
                    size = Size(barW, height.coerceAtLeast(if (h.sales.signum() > 0) 2f else 0f)),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
        Gap(Spacing.sm)
        Row {
            listOf("12a", "6a", "12p", "6p", "11p").forEachIndexed { i, label ->
                Text(label, style = BistroTheme.type.metadata, color = c.textTertiary, modifier = Modifier.weight(1f),
                    textAlign = when (i) { 0 -> androidx.compose.ui.text.style.TextAlign.Start; 4 -> androidx.compose.ui.text.style.TextAlign.End; else -> androidx.compose.ui.text.style.TextAlign.Center })
            }
        }
        if (peak.sales.signum() > 0) {
            Gap(Spacing.xs)
            Text("Busiest: ${peak.hour}:00–${peak.hour + 1}:00 · ${Format.money(peak.sales, cur)}", style = BistroTheme.type.supporting, color = c.textSecondary)
        }
    }
}

@Composable
private fun ReportSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 110.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Skeleton(Modifier.weight(1f), 72.dp); Skeleton(Modifier.weight(1f), 72.dp)
        }
        Skeleton(Modifier.fillMaxWidth(), 160.dp)
        Skeleton(Modifier.fillMaxWidth(), 200.dp)
    }
}
