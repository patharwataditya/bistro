package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.QuantityStepper
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.OrderItem
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.visual
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp

@Composable
fun OrderItemRow(
    item: OrderItem,
    quantity: Int,
    currency: String,
    editable: Boolean,
    busy: Boolean,
    canServe: Boolean,
    canVoid: Boolean,
    onQuantity: (Int) -> Unit,
    onNote: () -> Unit,
    onServe: () -> Unit,
    onVoid: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val voided = item.status == OrderItemStatus.Voided
    BistroCard(
        modifier = modifier.fillMaxWidth(),
        onClick = if (editable) onNote else null,
        onLongClick = if (canVoid) {
            {
                haptics.perform(Haptic.LongPress)
                onVoid()
            }
        } else {
            null
        },
        onClickLabel = if (editable) "Edit note or remove" else null,
        elevated = false,
        contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (!editable) {
                        Text("${item.quantity}×  ", style = BistroTheme.type.amount, color = c.textSecondary)
                    }
                    Text(
                        item.name, style = BistroTheme.type.bodyStrong,
                        color = if (voided) c.textTertiary else c.textPrimary,
                        textDecoration = if (voided) TextDecoration.LineThrough else null,
                    )
                }
                item.notes?.let {
                    Text("“$it”", style = BistroTheme.type.supporting.copy(fontStyle = FontStyle.Italic), color = c.accent)
                }
                if (voided && item.voidReason != null) {
                    Text(item.voidReason, style = BistroTheme.type.metadata, color = c.danger)
                }
                if (editable) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                        Icon(Icons.Rounded.EditNote, null, tint = c.textTertiary, modifier = Modifier.padding(end = 4.dp))
                        Text(if (item.notes == null) "Add note" else "Edit note", style = BistroTheme.type.metadata, color = c.textTertiary)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    Format.money(item.lineTotal, currency), style = BistroTheme.type.amount,
                    color = if (voided) c.textTertiary else c.textPrimary,
                    textDecoration = if (voided) TextDecoration.LineThrough else null,
                )
                when {
                    editable -> QuantityStepper(quantity, onQuantity, min = 1, max = 999, label = item.name, compact = true)
                    canServe -> BistroButton("Serve", onServe, style = ButtonStyle.Primary, size = ButtonSize.Small, loading = busy)
                    item.status != OrderItemStatus.Voided && item.status != OrderItemStatus.Served -> {
                        val v = item.status.visual
                        StatusChip(v.label, v.tone, icon = v.icon)
                    }
                }
                if (canVoid) {
                    BistroButton("Void", onVoid, style = ButtonStyle.Ghost, size = ButtonSize.Small)
                }
            }
        }
    }
}
