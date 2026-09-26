package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.feature.common.TotalsCard
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.OrderRoute
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Done
import androidx.compose.material.icons.rounded.LocalOffer
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun BillScreen(billId: Int) {
    val vm = bistroViewModel(key = "bill-$billId") { BillViewModel(it, billId) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)

    val bill = vm.bill
    // Live while money can still move; a settled bill only needs an occasional check.
    PollWhileVisible(if (bill == null || bill.status == BillStatus.Open) 10_000 else 60_000) { vm.refresh() }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BistroTopBar(
                title = bill?.let { "Bill ${it.billNumber}" } ?: "Bill",
                eyebrow = bill?.let { "Table ${it.tableName} · Check #${it.orderNumber}" },
                subtitle = bill?.let { "${it.serverName} · ${it.guestCount} guests" },
                onBack = navigator::back,
                actions = {
                    if (bill != null && session.can(Permission.ORDERS_VIEW)) {
                        BistroIconButton(Icons.AutoMirrored.Rounded.ReceiptLong, "Open check #${bill.orderNumber}", {
                            navigator.open(OrderRoute(bill.orderId))
                        })
                    }
                },
            )
            when (val s = vm.state) {
                LoadState.Loading -> BillSkeleton()
                is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
                is LoadState.Ready -> BillBody(s.data, s.staleError)
            }
        }
        if (bill != null) {
            BillActionBar(bill, vm, Modifier.align(Alignment.BottomCenter))
        }
    }

    if (bill != null) BillSheets(bill, vm)
}

@Composable
private fun BillBody(bill: Bill, staleError: AppError?) {
    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, top = Spacing.sm, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        item(key = "hero") { BillHero(bill) }
        item(key = "totals") {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TotalsCard(bill.toTotals(), bill.currencyCode, estimate = false)
                DiscountDetail(bill)
            }
        }
        item(key = "payments") { PaymentsSection(bill, Modifier.animateItem(placementSpec = Motion.placement)) }
    }
}

@Composable
private fun BillSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.widthIn(max = 120.dp).fillMaxWidth(), 14.dp)
        Skeleton(Modifier.widthIn(max = 220.dp).fillMaxWidth(), 46.dp)
        Skeleton(Modifier.widthIn(max = 180.dp).fillMaxWidth(), 16.dp)
        Gap(Spacing.md)
        Skeleton(Modifier.fillMaxWidth(), 180.dp)
        Skeleton(Modifier.fillMaxWidth(), 72.dp)
        Skeleton(Modifier.fillMaxWidth(), 72.dp)
    }
}

/** Sticky footer: the main money action large, the rest as a quieter row above it. */
@Composable
private fun BillActionBar(bill: Bill, vm: BillViewModel, modifier: Modifier) {
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    val c = BistroTheme.colors
    val canPay = session.can(Permission.BILLING_PROCESS_PAYMENT)
    val showDiscount = bill.canDiscount && session.can(Permission.BILLING_DISCOUNT)
    val showVoid = bill.canVoid && session.can(Permission.BILLING_VOID)
    val showRefund = bill.canRefund && session.can(Permission.BILLING_REFUND)
    val payPrimary = bill.canTakePayment && canPay
    val settlePrimary = bill.canSettleZero && canPay
    val refundPrimary = showRefund && bill.status != BillStatus.Open
    val anything = payPrimary || settlePrimary || showDiscount || showVoid || showRefund
    AnimatedVisibility(
        visible = anything,
        enter = slideInVertically(Motion.enter()) { it } + fadeIn(),
        exit = slideOutVertically(Motion.exit()) { it } + fadeOut(),
        modifier = modifier,
    ) {
        Column(
            Modifier.fillMaxWidth().background(c.background).navigationBarsPadding()
                .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            val secondary = buildList {
                if (showDiscount) add(Triple(if (bill.discountType != null) "Edit discount" else "Discount", Icons.Rounded.LocalOffer, BillSheet.Discount))
                if (showRefund && !refundPrimary) add(Triple("Refund", Icons.Rounded.Undo, BillSheet.Refund))
                if (showVoid) add(Triple("Void bill", Icons.Rounded.Block, BillSheet.Void))
            }
            if (secondary.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    secondary.forEach { (label, icon, sheet) ->
                        BistroButton(
                            label, { vm.open(sheet) }, icon = icon,
                            style = if (sheet == BillSheet.Void) ButtonStyle.Danger else ButtonStyle.Secondary,
                            enabled = vm.working == null, modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            when {
                payPrimary -> BistroButton(
                    text = "Take payment",
                    trailing = "· " + Format.money(bill.balanceDue, bill.currencyCode),
                    onClick = { vm.open(BillSheet.Payment) },
                    icon = Icons.Rounded.Payments,
                    style = ButtonStyle.Accent, size = ButtonSize.Large,
                    enabled = vm.working == null,
                    modifier = Modifier.fillMaxWidth(),
                )
                settlePrimary -> BistroButton(
                    text = "Close bill",
                    trailing = "· nothing to collect",
                    onClick = {
                        haptics.perform(Haptic.Confirm)
                        vm.settleZero()
                    },
                    icon = Icons.Rounded.Done,
                    size = ButtonSize.Large,
                    loading = vm.working == "settle",
                    modifier = Modifier.fillMaxWidth(),
                )
                refundPrimary -> BistroButton(
                    text = "Refund",
                    onClick = { vm.open(BillSheet.Refund) },
                    icon = Icons.Rounded.Undo,
                    style = ButtonStyle.Secondary, size = ButtonSize.Large,
                    enabled = vm.working == null,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
