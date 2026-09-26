package ai.synkrasis.bistro.feature.kitchen

import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.domain.TicketStatus
import ai.synkrasis.bistro.domain.Urgency
import ai.synkrasis.bistro.domain.urgencyFor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.RoomService
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.ui.graphics.vector.ImageVector
import java.time.Duration
import java.time.Instant

/** The pass, left to right. */
enum class Lane(val label: String, val emptyTitle: String, val emptyMessage: String, val icon: ImageVector) {
    New(
        "New", "No new tickets — the pass is quiet",
        "New orders appear here the moment a server sends them.", Icons.Rounded.RoomService,
    ),
    Preparing(
        "Preparing", "Nothing on the stove",
        "Start a new ticket and it moves here while it cooks.", Icons.Rounded.LocalFireDepartment,
    ),
    Ready(
        "Ready", "Nothing waiting at the pass",
        "Tickets marked ready wait here until they're served.", Icons.Rounded.TaskAlt,
    ),
    Done(
        "Done", "Nothing served recently",
        "Tickets served in the last 30 minutes are listed here.", Icons.Rounded.CheckCircle,
    ),
}

val Ticket.lane: Lane
    get() = when (status) {
        TicketStatus.New, TicketStatus.Accepted -> Lane.New
        TicketStatus.Preparing -> Lane.Preparing
        TicketStatus.Ready -> Lane.Ready
        TicketStatus.Completed, TicketStatus.Cancelled, TicketStatus.Unknown -> Lane.Done
    }

/** Active lanes oldest first (first in, first out); the done lane most recent first. */
fun List<Ticket>.inLane(lane: Lane): List<Ticket> {
    val inLane = filter { it.lane == lane }
    return if (lane == Lane.Done) {
        inLane.sortedByDescending { it.completedAt ?: it.firedAt }
    } else {
        inLane.sortedWith(compareBy<Ticket> { it.firedAt }.thenBy { it.id })
    }
}

data class TicketAction(val label: String, val to: TicketStatus, val icon: ImageVector)

/** The one big next step for a ticket. */
val Ticket.primaryAction: TicketAction?
    get() = when (status) {
        TicketStatus.New, TicketStatus.Accepted -> TicketAction("Start", TicketStatus.Preparing, Icons.Rounded.LocalFireDepartment)
        TicketStatus.Preparing -> TicketAction("Ready", TicketStatus.Ready, Icons.Rounded.TaskAlt)
        TicketStatus.Ready -> TicketAction("Served", TicketStatus.Completed, Icons.Rounded.CheckCircle)
        else -> null
    }

/** The quieter alternative: acknowledge without starting, or pull a ticket back from the pass. */
val Ticket.secondaryAction: TicketAction?
    get() = when (status) {
        TicketStatus.New -> TicketAction("Accept", TicketStatus.Accepted, Icons.Rounded.ThumbUp)
        TicketStatus.Ready -> TicketAction("Recall", TicketStatus.Preparing, Icons.Rounded.Undo)
        else -> null
    }

/**
 * What the ticket's timer measures. Waiting and cooking count from when it was fired (the
 * guest's wait); at the pass it counts how long the food has been sitting there.
 */
fun Ticket.timerStart(): Instant = when (status) {
    TicketStatus.Ready -> readyAt ?: firedAt
    else -> firedAt
}

fun Ticket.timerLabel(): String = when (status) {
    TicketStatus.New -> "Waiting"
    TicketStatus.Accepted -> "Accepted"
    TicketStatus.Preparing -> "Cooking"
    TicketStatus.Ready -> "At the pass"
    TicketStatus.Completed -> "Took"
    TicketStatus.Cancelled -> "Cancelled"
    TicketStatus.Unknown -> "Elapsed"
}

fun Ticket.urgency(now: Instant): Urgency =
    if (lane == Lane.Done) Urgency.Calm else urgencyFor(Duration.between(timerStart(), now).toMinutes())

val Urgency.label: String
    get() = when (this) {
        Urgency.Calm -> "On time"
        Urgency.Warm -> "Running late"
        Urgency.Hot -> "Overdue"
    }
