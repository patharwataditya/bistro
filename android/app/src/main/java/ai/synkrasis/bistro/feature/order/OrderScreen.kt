package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.SkeletonList
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Order
import ai.synkrasis.bistro.data.api.OrderItem
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.feature.common.TotalsCard
import ai.synkrasis.bistro.navigation.AddItemsRoute
import ai.synkrasis.bistro.navigation.BillRoute
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.RestaurantMenu
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.Instant

/** Sections of a check, in the order staff care about them. */
private val SECTIONS = listOf(
    "Not sent yet" to setOf(OrderItemStatus.Pending),
    "Ready to serve" to setOf(OrderItemStatus.Ready),
    "In the kitchen" to setOf(OrderItemStatus.Sent, OrderItemStatus.Preparing),
    "Served" to setOf(OrderItemStatus.Served),
    "Voided" to setOf(OrderItemStatus.Voided),
)

@Composable
fun OrderScreen(orderId: Int) {
    val vm = bistroViewModel(key = "order-$orderId") { OrderViewModel(it, orderId) }
    val navigator = LocalNavigator.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    PollWhileVisible(8_000) { vm.refresh() }
    var menuOpen by remember { mutableStateOf(false) }

    val order = (vm.state as? LoadState.Ready)?.data
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BistroTopBar(
                title = order?.let { "Table ${it.tableName}" } ?: "Order",
                eyebrow = order?.let { "Check #${it.orderNumber}" },
                subtitle = order?.let { "${it.guestCount} guests · ${it.serverName} · ${Format.elapsed(it.openedAt, Instant.now())}" },
                onBack = navigator::back,
                actions = {
                    if (order != null && order.status.isActive) {
                        BistroIconButton(Icons.Rounded.MoreVert, "Order actions", { menuOpen = true })
                    }
                },
            )
            when (val s = vm.state) {
                LoadState.Loading -> SkeletonList(rows = 6, rowHeight = 56.dp)
                is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
                is LoadState.Ready -> OrderBody(s.data, vm, s.staleError)
            }
        }
        if (order != null) {
            OrderActionBar(order, vm, Modifier.align(Alignment.BottomCenter))
        }
    }

    if (order != null) {
        OrderSheets(order, vm, menuOpen, onMenuClose = { menuOpen = false })
    }
}

@Composable
private fun OrderBody(order: Order, vm: OrderViewModel, staleError: ai.synkrasis.bistro.core.network.AppError?) {
    val session = LocalSession.current
    val c = BistroTheme.colors
    val canEdit = order.status == OrderStatus.Open && session.can(Permission.ORDERS_UPDATE)
    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        item(key = "status") {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                val v = order.status.visual
                StatusChip(v.label, v.tone, icon = v.icon)
                order.notes?.let { Text(it, style = BistroTheme.type.supporting, color = c.textSecondary) }
            }
        }
        if (order.items.isEmpty()) {
            item(key = "empty") {
                EmptyState(
                    icon = Icons.Rounded.RestaurantMenu,
                    title = "Nothing ordered yet",
                    message = if (canEdit) "Add items from the menu, then send them to the kitchen." else "Items will appear here as they're added.",
                    action = if (canEdit) {
                        { BistroButton("Add items", { vm.effects.navigate(AddItemsRoute(order.id)) }, icon = Icons.Rounded.Add) }
                    } else {
                        null
                    },
                )
            }
        }
        SECTIONS.forEach { (title, statuses) ->
            val items = order.items.filter { it.status in statuses }
            if (items.isNotEmpty()) {
                item(key = "h-$title") {
                    Text(
                        "${title.uppercase()} · ${items.sumOf { it.quantity }}",
                        style = BistroTheme.type.statusLabel, color = c.textTertiary,
                        modifier = Modifier.padding(top = Spacing.md).semantics { heading() }.animateItem(),
                    )
                }
                items(items, key = { it.id }) { item ->
                    OrderItemRow(
                        item = item,
                        currency = order.currencyCode,
                        editable = canEdit && item.status == OrderItemStatus.Pending,
                        busy = vm.working == "item-${item.id}",
                        canServe = session.can(Permission.ORDERS_UPDATE) && item.status == OrderItemStatus.Ready,
                        canVoid = order.status == OrderStatus.Open && session.can(Permission.ORDERS_CANCEL) &&
                            item.status != OrderItemStatus.Pending && item.status != OrderItemStatus.Voided,
                        quantity = vm.draftQuantities[item.id] ?: item.quantity,
                        onQuantity = { vm.setQuantity(item, it) },
                        onNote = { vm.noteTarget = item },
                        onServe = { vm.serve(item) },
                        onVoid = { vm.voidTarget = item },
                        modifier = Modifier.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
                    )
                }
            }
        }
        if (order.items.any { it.status != OrderItemStatus.Voided }) {
            item(key = "totals") {
                Gap(Spacing.md)
                TotalsCard(order.totals, order.currencyCode, estimate = order.billId == null)
            }
        }
    }
}

@Composable
private fun OrderActionBar(order: Order, vm: OrderViewModel, modifier: Modifier) {
    val session = LocalSession.current
    val c = BistroTheme.colors
    val navigator = LocalNavigator.current
    val haptics = LocalHaptics.current
    val pending = order.items.filter { it.status == OrderItemStatus.Pending }.sumOf { it.quantity }
    val live = order.items.any { it.status != OrderItemStatus.Voided }
    val show = order.status != OrderStatus.Unknown
    AnimatedVisibility(
        visible = show,
        enter = slideInVertically(Motion.enter()) { it } + fadeIn(),
        exit = slideOutVertically(Motion.exit()) { it } + fadeOut(),
        modifier = modifier,
    ) {
        Row(
            Modifier.fillMaxWidth().background(c.background).navigationBarsPadding()
                .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            when (order.status) {
                OrderStatus.Open -> {
                    if (session.can(Permission.ORDERS_UPDATE)) {
                        BistroButton(
                            "Add", { navigator.open(AddItemsRoute(order.id)) }, icon = Icons.Rounded.Add,
                            style = ButtonStyle.Secondary, size = ButtonSize.Large,
                        )
                    }
                    when {
                        pending > 0 && session.can(Permission.ORDERS_UPDATE) -> BistroButton(
                            text = "Send to kitchen",
                            trailing = "· $pending",
                            onClick = {
                                haptics.perform(Haptic.Confirm)
                                vm.fire()
                            },
                            icon = Icons.Rounded.Send,
                            style = ButtonStyle.Accent, size = ButtonSize.Large,
                            loading = vm.working == "fire",
                            modifier = Modifier.weight(1f),
                        )
                        pending == 0 && live && session.can(Permission.BILLING_CREATE) -> BistroButton(
                            text = "Issue bill",
                            trailing = "· " + Format.money(order.totals.total, order.currencyCode),
                            onClick = {
                                haptics.perform(Haptic.Confirm)
                                vm.createBill()
                            },
                            icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                            size = ButtonSize.Large,
                            loading = vm.working == "bill",
                            modifier = Modifier.weight(1f),
                        )
                        else -> Box(Modifier.weight(1f))
                    }
                }
                else -> if (order.billId != null && session.can(Permission.BILLING_VIEW)) {
                    BistroButton(
                        text = if (order.status == OrderStatus.Billed) "Take payment" else "View bill",
                        onClick = { navigator.open(BillRoute(order.billId)) },
                        icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                        style = if (order.status == OrderStatus.Billed) ButtonStyle.Accent else ButtonStyle.Secondary,
                        size = ButtonSize.Large,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
