package ai.synkrasis.bistro.feature.kitchen

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.data.api.TicketItem
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.Urgency
import ai.synkrasis.bistro.domain.visual
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.StickyNote2
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * A kitchen ticket, built to be read at arm's length: table, timer, items, and one big button
 * for the next step. [now] is read only by the timer and urgency bar, so the per-second tick
 * redraws those two small pieces rather than the whole card.
 */
@Composable
fun TicketCard(
    ticket: Ticket,
    now: () -> Instant,
    zone: ZoneId,
    canUpdate: Boolean,
    busy: Boolean,
    onAction: (TicketAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    BistroCard(modifier.fillMaxWidth(), contentPadding = PaddingValues(0.dp)) {
        UrgencyBar(ticket, now)
        Column(Modifier.padding(Spacing.lg)) {
            TicketHeader(ticket, now, zone)
            Gap(Spacing.sm)
            HairlineDivider()
            Gap(Spacing.xs)
            ticket.items.forEach { TicketItemRow(it) }
            ticket.orderNotes?.takeIf { it.isNotBlank() }?.let {
                Gap(Spacing.sm)
                OrderNote(it)
            }
            val orderOver = ticket.orderStatus == OrderStatus.Cancelled
            if (canUpdate && !orderOver && ticket.primaryAction != null) {
                Gap(Spacing.lg)
                TicketActions(ticket, busy, onAction)
            }
        }
    }
}

@Composable
private fun UrgencyBar(ticket: Ticket, now: () -> Instant) {
    val urgency = ticket.urgency(now())
    val tone = if (ticket.lane == Lane.Done) ticket.status.visual.tone else urgency.tone
    val color by animateColorAsState(tone.colors().content, Motion.standard(), label = "urgency-bar")
    Box(Modifier.fillMaxWidth().height(6.dp).background(color))
}

@Composable
private fun TicketHeader(ticket: Ticket, now: () -> Instant, zone: ZoneId) {
    val c = BistroTheme.colors
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(
                ticket.tableName, style = BistroTheme.type.tableLabel, color = c.textPrimary, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() },
            )
            Text(
                "Check #${ticket.orderNumber} · Ticket ${ticket.ticketNumber}",
                style = BistroTheme.type.identifier, color = c.textSecondary, maxLines = 1,
            )
            Text(ticket.serverName, style = BistroTheme.type.metadata, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            OrderStatusFlag(ticket)
        }
        if (ticket.lane == Lane.Done) DoneStamp(ticket, zone) else TicketTimer(ticket, now)
    }
}

/** Tells the kitchen the guests are gone (cancelled) or already settled (closed). */
@Composable
private fun OrderStatusFlag(ticket: Ticket) {
    if (ticket.orderStatus == OrderStatus.Cancelled || ticket.orderStatus == OrderStatus.Closed) {
        val v = ticket.orderStatus.visual
        Gap(Spacing.xs)
        StatusChip("Order ${v.label.lowercase()}", v.tone, icon = v.icon)
    } else if (ticket.status == ai.synkrasis.bistro.domain.TicketStatus.Accepted) {
        val v = ticket.status.visual
        Gap(Spacing.xs)
        StatusChip(v.label, v.tone, icon = v.icon)
    }
}

@Composable
private fun TicketTimer(ticket: Ticket, now: () -> Instant) {
    val instant = now()
    val start = ticket.timerStart()
    val urgency = ticket.urgency(instant)
    val tone = urgency.tone.colors()
    val color by animateColorAsState(
        if (urgency == Urgency.Calm) BistroTheme.colors.textPrimary else tone.content,
        Motion.standard(), label = "timer",
    )
    val minutes = Duration.between(start, instant).coerceAtLeast(Duration.ZERO).toMinutes()
    Column(
        horizontalAlignment = Alignment.End,
        modifier = Modifier.padding(start = Spacing.md).clearAndSetSemantics {
            contentDescription = "${ticket.timerLabel()} $minutes minutes, ${urgency.label}"
        },
    ) {
        Text(Format.clock(start, instant), style = BistroTheme.type.metric, color = color, maxLines = 1)
        Text(
            "${ticket.timerLabel()} · ${urgency.label}".uppercase(),
            style = BistroTheme.type.statusLabel,
            color = if (urgency == Urgency.Calm) BistroTheme.colors.textTertiary else tone.content,
            maxLines = 1,
        )
    }
}

@Composable
private fun DoneStamp(ticket: Ticket, zone: ZoneId) {
    val c = BistroTheme.colors
    val v = ticket.status.visual
    Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = Spacing.md)) {
        StatusChip(v.label, v.tone, icon = v.icon)
        ticket.completedAt?.let { done ->
            Gap(Spacing.xs)
            Text(Format.time(done, zone), style = BistroTheme.type.amount, color = c.textPrimary)
            Text("Took ${Format.clock(ticket.firedAt, done)}", style = BistroTheme.type.metadata, color = c.textTertiary)
        }
    }
}

@Composable
private fun TicketItemRow(item: TicketItem) {
    val c = BistroTheme.colors
    val voided = item.status == OrderItemStatus.Voided
    val textColor = if (voided) c.textTertiary else c.textPrimary
    val decoration = if (voided) TextDecoration.LineThrough else null
    val itemStyle = BistroTheme.type.sectionTitle.copy(textDecoration = decoration)
    Row(
        Modifier.fillMaxWidth().padding(vertical = Spacing.xs).semantics(mergeDescendants = true) {
            if (voided) contentDescription = "Voided: ${item.quantity} × ${item.name}"
        },
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            "${item.quantity}×",
            style = itemStyle.copy(fontFeatureSettings = "tnum, lnum"),
            color = if (voided) c.textTertiary else c.accent,
            modifier = Modifier.widthIn(min = 40.dp),
        )
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.name, style = itemStyle, color = textColor, modifier = Modifier.weight(1f, fill = false))
                if (voided) {
                    Text(
                        "VOID", style = BistroTheme.type.statusLabel, color = c.danger,
                        modifier = Modifier.padding(start = Spacing.sm).clip(Radii.xs).background(c.dangerSoft)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            item.notes?.takeIf { it.isNotBlank() }?.let { note ->
                Text(
                    note,
                    style = BistroTheme.type.bodyStrong.copy(fontStyle = FontStyle.Italic, textDecoration = decoration),
                    color = if (voided) c.textTertiary else c.accent,
                )
            }
        }
    }
}

@Composable
private fun OrderNote(note: String) {
    val c = BistroTheme.colors
    Row(
        Modifier.fillMaxWidth().clip(Radii.sm).background(c.accentSoft).padding(Spacing.md)
            .semantics(mergeDescendants = true) { contentDescription = "Order note: $note" },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Icon(Icons.AutoMirrored.Rounded.StickyNote2, null, tint = c.accent, modifier = Modifier.size(18.dp))
        Text(note, style = BistroTheme.type.bodyStrong.copy(fontStyle = FontStyle.Italic), color = c.textPrimary)
    }
}

@Composable
private fun TicketActions(ticket: Ticket, busy: Boolean, onAction: (TicketAction) -> Unit) {
    val primary = ticket.primaryAction ?: return
    val secondary = ticket.secondaryAction
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
        if (secondary != null) {
            BistroButton(
                text = secondary.label,
                onClick = { onAction(secondary) },
                icon = secondary.icon,
                style = ButtonStyle.Secondary,
                size = ButtonSize.Large,
                enabled = !busy,
                modifier = Modifier.weight(1f),
            )
        }
        BistroButton(
            text = primary.label,
            onClick = { onAction(primary) },
            icon = primary.icon,
            style = ButtonStyle.Primary,
            size = ButtonSize.Large,
            loading = busy,
            modifier = Modifier.weight(1.6f),
        )
    }
}
