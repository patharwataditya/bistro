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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Chair
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.TouchApp
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
    val order = table.activeOrder
    // The stripe matches the chip that is shown ("Bill issued" is informational, not occupied).
    val billed = order?.status == OrderStatus.Billed
    val tone = (if (billed) Tone.Info else visual.tone).colors()
    // Scales with the user's font size, so large text never clips; rows still line up.
    val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale.coerceIn(1f, 1.8f)
    val stripe by animateColorAsState(tone.content, Motion.standard(), label = "stripe")
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
        modifier = modifier.height(CARD_HEIGHT * fontScale).clearAndSetSemantics {
            contentDescription = description
            onClick(label = if (order != null) "Open order" else "Seat guests") { onTap(); true }
            onLongClick(label = "Table actions") { onLongPress(); true }
        },
        onClick = onTap,
        onLongClick = onLongPress,
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(Modifier.fillMaxHeight()) {
            Box(Modifier.padding(vertical = Spacing.lg).width(4.dp).fillMaxHeight().clip(Radii.pill).background(stripe))
            Column(
                Modifier.padding(start = Spacing.md, end = Spacing.md, top = Spacing.md, bottom = Spacing.md).fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
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
                }
                if (order != null) {
                    Column {
                        Text(
                            "#${order.orderNumber} · ${order.guestCount} guests · ${Format.elapsed(order.openedAt, now)}",
                            style = BistroTheme.type.metadata, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(2.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            Text(Format.money(order.subtotal, session.currency), style = BistroTheme.type.amountSmall, color = c.textPrimary,
                                maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                            // One flag, the most urgent: food waiting beats items not yet sent.
                            when {
                                order.readyCount > 0 -> MiniFlag("${order.readyCount} ready", Tone.Success)
                                order.pendingCount > 0 -> MiniFlag("${order.pendingCount} unsent", Tone.Warning)
                            }
                        }
                    }
                } else {
                    Column {
                        table.statusNote?.let {
                            Text(it, style = BistroTheme.type.metadata, color = c.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        if (table.status.seatable) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.TouchApp, null, tint = c.textTertiary, modifier = Modifier.size(12.dp))
                                Text(" Tap to seat", style = BistroTheme.type.metadata, color = c.textTertiary)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Fixed so a row of the floor grid lines up, whatever each table is doing. */
private val CARD_HEIGHT = 136.dp

@Composable
private fun MiniFlag(text: String, tone: Tone) {
    val colors = tone.colors()
    Text(
        text, style = BistroTheme.type.statusLabel, color = colors.content, maxLines = 1, softWrap = false,
        modifier = Modifier.clip(Radii.xs).background(colors.container).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

