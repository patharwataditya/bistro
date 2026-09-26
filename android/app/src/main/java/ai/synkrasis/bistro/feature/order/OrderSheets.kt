package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.QuantityStepper
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.Order
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CallMerge
import androidx.compose.material.icons.rounded.CallSplit
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

@Composable
fun OrderSheets(order: Order, vm: OrderViewModel, menuOpen: Boolean, onMenuClose: () -> Unit) {
    val session = LocalSession.current
    if (menuOpen) {
        val canEdit = order.status == OrderStatus.Open
        BistroSheet(title = "Check #${order.orderNumber}", subtitle = "Table ${order.tableName}", onDismiss = onMenuClose) {
            if (session.can(Permission.ORDERS_UPDATE)) {
                MenuRow(Icons.Rounded.Groups, "Change guests", "${order.guestCount} now") { onMenuClose(); vm.editGuests = true }
            }
            if (session.can(Permission.ORDERS_TRANSFER)) {
                MenuRow(Icons.Rounded.SwapHoriz, "Move to another table", "Guests changed tables") { onMenuClose(); vm.openPicker(TablePick.Move) }
                if (canEdit) {
                    MenuRow(Icons.Rounded.CallMerge, "Merge a table into this one", "Combine two checks") { onMenuClose(); vm.openPicker(TablePick.Merge) }
                    MenuRow(Icons.Rounded.CallSplit, "Split items to a new table", "Part of the party moved") { onMenuClose(); vm.openPicker(TablePick.Split) }
                }
            }
            if (canEdit && session.can(Permission.ORDERS_UPDATE)) {
                val fired = order.items.any { it.status != OrderItemStatus.Pending && it.status != OrderItemStatus.Voided }
                if (!fired || session.can(Permission.ORDERS_CANCEL)) {
                    MenuRow(Icons.Rounded.Cancel, "Cancel order", "Frees the table", danger = true) { onMenuClose(); vm.confirmCancel = true }
                }
            }
            Gap(Spacing.md)
        }
    }

    vm.noteTarget?.let { item ->
        var note by rememberSaveable(item.id) { mutableStateOf(item.notes.orEmpty()) }
        BistroSheet(
            title = "Note for ${item.name}",
            subtitle = "The kitchen sees this on the ticket.",
            onDismiss = { vm.noteTarget = null },
            actions = {
                ActionPair(
                    secondary = {
                        BistroButton("Remove item", { vm.removeItem(item) }, style = ButtonStyle.Danger, modifier = Modifier.fillMaxWidth(),
                            enabled = vm.working == null)
                    },
                    primary = {
                        BistroButton("Save note", { vm.setNote(item, note) }, modifier = Modifier.fillMaxWidth(), loading = vm.working == "item-${item.id}")
                    },
                )
            },
        ) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                listOf("No onions", "Extra spicy", "Mild", "No nuts", "Gluten free", "On the side").forEach { quick ->
                    Box(
                        Modifier.clip(Radii.pill).border(1.dp, BistroTheme.colors.border, Radii.pill)
                            .clickable { note = if (note.isBlank()) quick else "$note, $quick" }
                            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    ) { Text(quick, style = BistroTheme.type.supporting, color = BistroTheme.colors.textPrimary) }
                }
            }
            Gap(Spacing.md)
            BistroTextField(note, { note = it.take(200) }, "Note", Modifier.fillMaxWidth(), singleLine = false, minLines = 2)
        }
    }

    vm.voidTarget?.let { item ->
        var reason by rememberSaveable(item.id) { mutableStateOf("") }
        ConfirmDialog(
            title = "Void ${item.quantity}× ${item.name}?",
            message = "It comes off the check and the kitchen stops it if it isn't finished. This is recorded in the audit log.",
            confirmLabel = "Void item",
            destructive = true,
            loading = vm.working == "void",
            confirmEnabled = reason.trim().length >= 3,
            onConfirm = { vm.void(item, reason) },
            onDismiss = { vm.voidTarget = null },
            body = { BistroTextField(reason, { reason = it.take(200) }, "Reason", Modifier.fillMaxWidth(), placeholder = "e.g. Guest changed mind") },
        )
    }

    if (vm.confirmCancel) {
        var reason by rememberSaveable { mutableStateOf("") }
        ConfirmDialog(
            title = "Cancel check #${order.orderNumber}?",
            message = "Every item is voided, open kitchen tickets are stopped and the table is released.",
            confirmLabel = "Cancel order",
            destructive = true,
            loading = vm.working == "cancel",
            confirmEnabled = reason.trim().length >= 3,
            onConfirm = { vm.cancel(reason) },
            onDismiss = { vm.confirmCancel = false },
            body = { BistroTextField(reason, { reason = it.take(200) }, "Reason", Modifier.fillMaxWidth(), placeholder = "e.g. Guests left") },
        )
    }

    if (vm.editGuests) {
        var guests by rememberSaveable { mutableIntStateOf(order.guestCount) }
        BistroSheet(
            title = "Guests at ${order.tableName}",
            onDismiss = { vm.editGuests = false },
            actions = { BistroButton("Save", { vm.updateGuests(guests) }, Modifier.fillMaxWidth(), loading = vm.working == "guests", enabled = guests != order.guestCount) },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Guests", style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary, modifier = Modifier.weight(1f))
                QuantityStepper(guests, { guests = it }, min = 1, max = 100, label = "Guests")
            }
            Gap(Spacing.md)
        }
    }

    vm.tablePick?.let { pick -> TablePickerSheet(order, pick, vm) }
    vm.confirmPick?.let { table ->
        val merge = vm.tablePick == TablePick.Merge
        ConfirmDialog(
            title = if (merge) "Merge ${table.name} into this check?" else "Move to ${table.name}?",
            message = if (merge) {
                val src = table.activeOrder
                "Check #${src?.orderNumber} (${src?.let { Format.money(it.subtotal, order.currencyCode) }}) joins #${order.orderNumber}. " +
                    "${table.name} is released. This can't be undone."
            } else {
                "Check #${order.orderNumber} moves from ${order.tableName} to ${table.name}; ${order.tableName} is released."
            },
            confirmLabel = if (merge) "Merge" else "Move",
            loading = vm.working != null,
            onConfirm = { vm.pickTable(table) },
            onDismiss = { vm.confirmPick = null },
        )
    }
}

@Composable
private fun MenuRow(icon: ImageVector, title: String, subtitle: String, danger: Boolean = false, onClick: () -> Unit) {
    val c = BistroTheme.colors
    Row(
        Modifier.fillMaxWidth().clip(Radii.md).clickable(role = Role.Button, onClick = onClick).padding(vertical = Spacing.md, horizontal = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(Radii.md).background(if (danger) c.dangerSoft else c.surfaceSunken), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = if (danger) c.danger else c.textPrimary)
        }
        Column(Modifier.padding(start = Spacing.md)) {
            Text(title, style = BistroTheme.type.bodyStrong, color = if (danger) c.danger else c.textPrimary)
            Text(subtitle, style = BistroTheme.type.supporting, color = c.textSecondary)
        }
    }
}

@Composable
private fun TablePickerSheet(order: Order, pick: TablePick, vm: OrderViewModel) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val title = when (pick) {
        TablePick.Move -> "Move to which table?"
        TablePick.Merge -> "Which table's check should join this one?"
        TablePick.Split -> "Split items to a new table"
    }
    val subtitle = when (pick) {
        TablePick.Move -> "Free tables only. ${order.tableName} will be released."
        TablePick.Merge -> "Its items and guests join this check; that table is released."
        TablePick.Split -> "Choose the items, then a free table for them."
    }
    // Only items whose kitchen ticket is finished (or never fired) can be split away.
    val splittable = order.items.filter { item ->
        when (item.status) {
            OrderItemStatus.Pending -> true
            // A served item may move only once its whole kitchen ticket is finished.
            OrderItemStatus.Served -> order.items.filter { it.ticketId == item.ticketId }
                .all { it.status == OrderItemStatus.Served || it.status == OrderItemStatus.Voided }
            else -> false
        }
    }
    val live = order.items.count { it.status != OrderItemStatus.Voided }
    BistroSheet(title = title, subtitle = subtitle, onDismiss = { vm.tablePick = null }) {
        if (pick == TablePick.Split) {
            if (splittable.isEmpty()) {
                Text("Nothing can be split yet: items still with the kitchen stay on this check until they're served.",
                    style = BistroTheme.type.supporting, color = c.textSecondary)
                return@BistroSheet
            }
            splittable.forEach { item ->
                val selected = item.id in vm.splitSelection
                Row(
                    Modifier.fillMaxWidth().clip(Radii.md).clickable(role = Role.Checkbox) {
                        haptics.perform(Haptic.Selection)
                        vm.splitSelection = if (selected) vm.splitSelection - item.id else vm.splitSelection + item.id
                    }.padding(vertical = Spacing.sm, horizontal = Spacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(if (selected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank, null, tint = if (selected) c.accent else c.textTertiary)
                    Text("${item.quantity}× ${item.name}", style = BistroTheme.type.body, color = c.textPrimary, modifier = Modifier.weight(1f).padding(start = Spacing.sm))
                    Text(Format.money(item.lineTotal, order.currencyCode), style = BistroTheme.type.amountSmall, color = c.textSecondary)
                }
            }
            if (vm.splitSelection.size >= live) {
                Gap(Spacing.sm)
                Text("That's every item — move the whole order instead.", style = BistroTheme.type.metadata, color = c.warning)
            }
            Gap(Spacing.md)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Guests moving", style = BistroTheme.type.bodyStrong, color = c.textPrimary, modifier = Modifier.weight(1f))
                QuantityStepper(vm.splitGuests, { vm.splitGuests = it }, min = 1, max = 100, label = "Guests moving", compact = true)
            }
            Gap(Spacing.lg)
            Text("TABLE", style = BistroTheme.type.statusLabel, color = c.textTertiary)
            Gap(Spacing.sm)
        }
        when (val s = vm.pickerTables) {
            LoadState.Loading -> repeat(3) { Skeleton(Modifier.fillMaxWidth().padding(vertical = 4.dp), 52.dp) }
            is LoadState.Failed -> ErrorState(s.error, onRetry = { vm.openPicker(pick) })
            is LoadState.Ready -> {
                val candidates = s.data.filter { t ->
                    when (pick) {
                        TablePick.Move, TablePick.Split -> t.id != order.tableId && t.activeOrder == null && t.status.seatable
                        TablePick.Merge -> t.id != order.tableId && t.activeOrder?.status == OrderStatus.Open
                    }
                }
                if (candidates.isEmpty()) {
                    EmptyState(Icons.Rounded.TableRestaurant, "No suitable tables", when (pick) {
                        TablePick.Merge -> "No other table has an open check to merge."
                        else -> "Every table is taken or unavailable right now."
                    })
                }
                val enabled = pick != TablePick.Split ||
                    (vm.splitSelection.isNotEmpty() && vm.splitSelection.size < order.items.count { it.status != OrderItemStatus.Voided })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    candidates.forEach { table -> PickTableTile(table, enabled, vm.working != null) { vm.pickTable(table) } }
                }
                if (pick == TablePick.Split && vm.splitSelection.isEmpty() && candidates.isNotEmpty()) {
                    Gap(Spacing.sm)
                    Text("Select at least one item first.", style = BistroTheme.type.metadata, color = c.textTertiary)
                }
            }
        }
        Gap(Spacing.lg)
    }
}

@Composable
private fun PickTableTile(table: DiningTable, enabled: Boolean, busy: Boolean, onPick: () -> Unit) {
    val c = BistroTheme.colors
    val v = table.status.visual
    BistroCard(
        modifier = Modifier.width(104.dp),
        onClick = if (enabled && !busy) onPick else null,
        elevated = false,
        borderColor = if (enabled) c.borderStrong else c.border,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(Spacing.md),
    ) {
        Text(table.name, style = BistroTheme.type.tableLabel, color = if (enabled) c.textPrimary else c.textDisabled)
        Text("${table.capacity} seats", style = BistroTheme.type.metadata, color = c.textSecondary)
        Gap(Spacing.xs)
        table.activeOrder?.let { Text("#${it.orderNumber} · ${it.guestCount}", style = BistroTheme.type.metadata, color = c.textSecondary) }
            ?: StatusChip(v.label, v.tone)
    }

}
