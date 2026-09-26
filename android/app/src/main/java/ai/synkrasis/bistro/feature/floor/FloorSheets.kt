package ai.synkrasis.bistro.feature.floor

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.QuantityStepper
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.visual
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

@Composable
fun SeatGuestsSheet(
    draft: SeatDraft,
    busy: Boolean,
    onGuestsChange: (Int) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val c = BistroTheme.colors
    val table = draft.table
    BistroSheet(
        title = "Seat ${table.name}",
        subtitle = "${table.capacity} seats${table.areaName?.let { " · $it" } ?: ""}" +
            (table.statusNote?.let { " · $it" } ?: ""),
        onDismiss = { if (!busy) onDismiss() },
        busy = busy,
        actions = {
            BistroButton(
                text = "Open table",
                trailing = "· ${draft.guests} ${if (draft.guests == 1) "guest" else "guests"}",
                onClick = onConfirm,
                style = ButtonStyle.Accent,
                size = ButtonSize.Large,
                loading = busy,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        if (table.status != TableStatus.Available) {
            val v = table.status.visual
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                StatusChip(v.label, v.tone, icon = v.icon)
                Text(
                    if (table.status == TableStatus.Reserved) "Seating here will use the reservation." else "Make sure the table is ready.",
                    style = BistroTheme.type.supporting, color = c.textSecondary,
                )
            }
            Gap(Spacing.lg)
        }
        Row(
            Modifier.fillMaxWidth().clip(Radii.lg).background(c.surfaceSunken).padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Groups, null, tint = c.textSecondary)
            Column(Modifier.weight(1f).padding(start = Spacing.md)) {
                Text("Guests", style = BistroTheme.type.bodyStrong, color = c.textPrimary)
                if (draft.guests > table.capacity) {
                    Text("More than the ${table.capacity} seats", style = BistroTheme.type.metadata, color = c.warning)
                }
            }
            QuantityStepper(draft.guests, onGuestsChange, min = 1, max = 100, label = "Guests")
        }
        Gap(Spacing.sm)
    }
}

/** Long-press / non-seatable tap: change status by hand (never to or from Occupied). */
@Composable
fun TableActionsSheet(
    table: DiningTable,
    canManage: Boolean,
    canSeat: Boolean,
    busy: Boolean,
    onSetStatus: (TableStatus, String?) -> Unit,
    onSeat: () -> Unit,
    onOpenOrder: () -> Unit,
    onDismiss: () -> Unit,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    var choice by rememberSaveable(table.id) { mutableStateOf(table.status.takeIf { it.manuallySettable }) }
    var note by rememberSaveable(table.id) { mutableStateOf(table.statusNote.orEmpty()) }
    val occupied = table.activeOrder != null
    BistroSheet(
        title = "Table ${table.name}",
        subtitle = "${table.capacity} seats · currently ${table.status.visual.label.lowercase()}",
        onDismiss = { if (!busy) onDismiss() },
        actions = when {
            occupied -> ({
                BistroButton("Open order", onOpenOrder, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large)
            })
            canManage -> ({
                ActionPair(
                    secondary = {
                        if (canSeat && table.status.seatable) {
                            BistroButton("Seat guests", onSeat, style = ButtonStyle.Secondary, modifier = Modifier.fillMaxWidth())
                        } else {
                            BistroButton("Close", onDismiss, style = ButtonStyle.Secondary, modifier = Modifier.fillMaxWidth())
                        }
                    },
                    primary = {
                        BistroButton(
                            "Save status",
                            { choice?.let { onSetStatus(it, note.takeIf { n -> n.isNotBlank() }) } },
                            enabled = choice != null && (choice != table.status || note != table.statusNote.orEmpty()),
                            loading = busy,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    },
                )
            })
            else -> null
        },
    ) {
        when {
            occupied -> Text(
                "This table has an open order. Its status follows the order: it frees up when the bill is paid or the order is moved.",
                style = BistroTheme.type.body, color = c.textSecondary,
            )
            !canManage -> Text("You can't change table status. Ask a manager.", style = BistroTheme.type.body, color = c.textSecondary)
            else -> {
                listOf(TableStatus.Available, TableStatus.Reserved, TableStatus.Cleaning, TableStatus.Blocked).forEach { status ->
                    val v = status.visual
                    val tone = v.tone.colors()
                    val selected = choice == status
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(Radii.md)
                            .border(1.dp, if (selected) tone.content else c.border, Radii.md)
                            .background(if (selected) tone.container else Color.Transparent)
                            .clickable(role = Role.RadioButton) {
                                haptics.perform(Haptic.Selection)
                                choice = status
                            }
                            .padding(Spacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(32.dp).clip(Radii.sm).background(tone.container), contentAlignment = Alignment.Center) {
                            Icon(v.icon, null, tint = tone.content, modifier = Modifier.size(18.dp))
                        }
                        Text(v.label, style = BistroTheme.type.bodyStrong, color = c.textPrimary, modifier = Modifier.weight(1f).padding(start = Spacing.md))
                        if (selected) Icon(Icons.Rounded.Check, "Selected", tint = tone.content)
                    }
                }
                if (choice != null && choice != TableStatus.Available) {
                    Gap(Spacing.md)
                    BistroTextField(
                        value = note, onValueChange = { note = it.take(120) },
                        label = if (choice == TableStatus.Reserved) "Reservation (name, time)" else "Note (optional)",
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
