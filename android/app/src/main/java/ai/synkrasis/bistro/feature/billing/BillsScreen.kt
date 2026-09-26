package ai.synkrasis.bistro.feature.billing

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
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.BillSummary
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.BillRoute
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
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
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.DoNotDisturbOn
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.math.BigDecimal
import java.time.Instant

@Composable
fun BillsScreen() {
    val session = LocalSession.current
    val vm = bistroViewModel { BillsViewModel(it, session.zone) }
    PollWhileVisible(10_000) { vm.refresh() }
    val bills = (vm.state as? LoadState.Ready)?.data
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Bills",
            eyebrow = session.me.location.name,
            subtitle = bills?.let { listSummary(vm.filter, it, session.currency) },
        )
        SegmentedControl(BillsFilter.entries, vm.filter, vm::select, { it.label }, Modifier.padding(horizontal = Spacing.gutter))
        when (val s = vm.state) {
            LoadState.Loading -> SkeletonList(rowHeight = 84.dp)
            is LoadState.Failed -> ErrorState(s.error, vm::retry, Modifier.fillMaxSize())
            is LoadState.Ready -> BillList(vm.filter, s.data, s.staleError)
        }
    }
}

private fun listSummary(filter: BillsFilter, bills: List<BillSummary>, currency: String): String = when (filter) {
    BillsFilter.Open -> {
        val due = bills.fold(BigDecimal.ZERO) { acc, b -> acc + b.balanceDue }
        "${bills.size} open · ${Format.money(due, currency)} outstanding"
    }
    BillsFilter.PaidToday -> {
        val taken = bills.fold(BigDecimal.ZERO) { acc, b -> acc + b.total }
        "${bills.size} settled · ${Format.money(taken, currency)} billed"
    }
    BillsFilter.Void -> "${bills.size} voided"
}

@Composable
private fun BillList(filter: BillsFilter, bills: List<BillSummary>, staleError: AppError?) {
    val navigator = LocalNavigator.current
    val now = Instant.now()
    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, top = Spacing.md, bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        if (bills.isEmpty()) {
            item(key = "empty-${filter.name}") { BillsEmpty(filter) }
        }
        items(bills, key = { it.id }) { bill ->
            BillSummaryCard(
                bill = bill,
                now = now,
                onOpen = { navigator.open(BillRoute(bill.id)) },
                modifier = Modifier.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
            )
        }
    }
}

@Composable
private fun BillsEmpty(filter: BillsFilter) = when (filter) {
    BillsFilter.Open -> EmptyState(
        Icons.AutoMirrored.Rounded.ReceiptLong, "No bills waiting",
        "Every issued bill has been settled. Bills issued from a check appear here until they're paid.",
    )
    BillsFilter.PaidToday -> EmptyState(
        Icons.Rounded.TaskAlt, "Nothing settled yet today",
        "Bills appear here as soon as they're paid in full.",
    )
    BillsFilter.Void -> EmptyState(
        Icons.Rounded.DoNotDisturbOn, "No voided bills",
        "Voided bills are kept here for the record.",
    )
}

@Composable
private fun BillSummaryCard(bill: BillSummary, now: Instant, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    val v = bill.status.visual
    val open = bill.status == BillStatus.Open
    val whenText = Format.relative(bill.paidAt ?: bill.createdAt, now, session.zone)
    val headline = if (open) bill.balanceDue else bill.total
    val description = buildString {
        append("Bill ${bill.billNumber}, table ${bill.tableName}, check ${bill.orderNumber}, ${v.label}. ")
        if (open) {
            append("${Format.money(bill.balanceDue, session.currency)} due of ${Format.money(bill.total, session.currency)}. ")
        } else {
            append("Total ${Format.money(bill.total, session.currency)}. ")
        }
        append(whenText)
    }
    BistroCard(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = description
            onClick(label = "Open bill") { onOpen(); true }
        },
        onClick = onOpen,
        elevated = false,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(bill.billNumber, style = BistroTheme.type.identifier, color = c.textSecondary)
                Text(
                    "Table ${bill.tableName}", style = BistroTheme.type.cardTitle, color = c.textPrimary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text("Check #${bill.orderNumber} · $whenText", style = BistroTheme.type.metadata, color = c.textTertiary, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Text(
                    Format.money(headline, session.currency),
                    style = if (open) BistroTheme.type.amountLarge else BistroTheme.type.amount,
                    color = if (bill.status == BillStatus.Void) c.textTertiary else c.textPrimary,
                )
                if (open && bill.paidTotal.signum() > 0) {
                    Text("due of ${Format.money(bill.total, session.currency)}", style = BistroTheme.type.metadata, color = c.textSecondary)
                }
                StatusChip(v.label, v.tone, icon = v.icon)
            }
        }
    }
}
