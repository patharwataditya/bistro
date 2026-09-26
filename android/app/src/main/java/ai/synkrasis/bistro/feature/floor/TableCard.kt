package ai.synkrasis.bistro.feature.floor

import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Chair
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant

/**
 * A table at a glance: name and seats, status (icon + word + colour stripe), and for an
 * occupied table the check number, covers, time seated, running total and what needs doing.
 */
@Composable
fun TableCard(
    table: DiningTable,
    now: Instant,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    val visual = table.status.visual
    val tone = visual.tone.colors()
    val stripe by animateColorAsState(tone.content, Motion.standard(), label = "stripe")
    val order = table.activeOrder
    val description = buildString {
        append("Table ${table.name}, ${table.capacity} seats, ${visual.label}")
        table.statusNote?.let { append(", $it") }
        if (order != null) {
            append(", order ${order.orderNumber}, ${order.guestCount} guests, seated ${Format.elapsed(order.openedAt, now)}")
            append(", ${Format.money(order.subtotal, session.currency)}")
            if (order.readyCount > 0) append(", ${order.readyCount} ready to serve")
            if (order.pendingCount > 0) append(", ${order.pendingCount} not sent")
        }
    }

    BistroCard(
        modifier = modifier.heightIn(min = 138.dp).clearAndSetSemantics {
            contentDescription = description
            onClick(label = if (order != null) "Open order" else "Seat guests") { onTap(); true }
            onLongClick(label = "Table actions") { onLongPress(); true }
        },
        onClick = onTap,
        onLongClick = onLongPress,
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(4.dp).fillMaxHeight().heightIn(min = 138.dp).background(stripe))
            Column(Modifier.padding(start = Spacing.md, end = Spacing.md, top = Spacing.md, bottom = Spacing.md).fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(table.name, style = BistroTheme.type.tableLabel, color = c.textPrimary, modifier = Modifier.weight(1f), maxLines = 1)
                    Icon(Icons.Rounded.Chair, null, tint = c.textTertiary, modifier = Modifier.size(14.dp))
                    Text(" ${table.capacity}", style = BistroTheme.type.metadata, color = c.textTertiary)
                }
                Spacer(Modifier.height(Spacing.xs))
                AnimatedContent(
                    targetState = table.status to (order?.status == OrderStatus.Billed),
                    transitionSpec = { fadeIn(Motion.standard()) togetherWith fadeOut(Motion.fast()) },
                    label = "status",
                ) { (status, billed) ->
                    if (billed) {
                        StatusChip("Bill issued", Tone.Info, icon = OrderStatus.Billed.visual.icon)
                    } else {
                        val v = status.visual
                        StatusChip(v.label, v.tone, icon = v.icon)
                    }
                }
                Spacer(Modifier.weight(1f, fill = false).height(Spacing.sm))
                if (order != null) {
                    Spacer(Modifier.height(Spacing.sm))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("#${order.orderNumber}", style = BistroTheme.type.identifier, color = c.textSecondary)
                        Text(" · ${order.guestCount} guests", style = BistroTheme.type.metadata, color = c.textSecondary, maxLines = 1)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Schedule, null, tint = c.textTertiary, modifier = Modifier.size(12.dp))
                        Text(" ${Format.elapsed(order.openedAt, now)}", style = BistroTheme.type.metadata, color = c.textTertiary)
                        Spacer(Modifier.weight(1f))
                        Text(Format.money(order.subtotal, session.currency), style = BistroTheme.type.amountSmall, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Clip)
                    }
                    if (order.readyCount > 0 || order.pendingCount > 0) {
                        Spacer(Modifier.height(Spacing.xs))
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            if (order.readyCount > 0) MiniFlag("${order.readyCount} ready", Tone.Success)
                            if (order.pendingCount > 0) MiniFlag("${order.pendingCount} unsent", Tone.Warning)
                        }
                    }
                } else if (table.statusNote != null) {
                    Spacer(Modifier.height(Spacing.sm))
                    Text(table.statusNote, style = BistroTheme.type.metadata, color = c.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun MiniFlag(text: String, tone: Tone) {
    val colors = tone.colors()
    Text(
        text, style = BistroTheme.type.statusLabel, color = colors.content,
        modifier = Modifier.clip(Radii.xs).background(colors.container).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

