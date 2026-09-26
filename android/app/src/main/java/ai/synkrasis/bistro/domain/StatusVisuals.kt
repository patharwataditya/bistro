package ai.synkrasis.bistro.domain

import ai.synkrasis.bistro.core.designsystem.component.Tone
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.DoNotDisturbOn
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.HelpOutline
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.Moving
import androidx.compose.material.icons.rounded.People
import androidx.compose.material.icons.rounded.RoomService
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.ui.graphics.vector.ImageVector

/** One mapping from state to label/tone/icon, so every screen shows a status the same way. */
data class StatusVisual(val label: String, val tone: Tone, val icon: ImageVector)

val TableStatus.visual: StatusVisual
    get() = when (this) {
        TableStatus.Available -> StatusVisual("Available", Tone.Success, Icons.Rounded.CheckCircle)
        TableStatus.Occupied -> StatusVisual("Occupied", Tone.Accent, Icons.Rounded.People)
        TableStatus.Reserved -> StatusVisual("Reserved", Tone.Info, Icons.Rounded.EventAvailable)
        TableStatus.Cleaning -> StatusVisual("Cleaning", Tone.Cleaning, Icons.Rounded.CleaningServices)
        TableStatus.Blocked -> StatusVisual("Blocked", Tone.Neutral, Icons.Rounded.Block)
        TableStatus.Unknown -> StatusVisual("Unknown", Tone.Neutral, Icons.Rounded.HelpOutline)
    }

val TicketStatus.visual: StatusVisual
    get() = when (this) {
        TicketStatus.New -> StatusVisual("New", Tone.Info, Icons.Rounded.RoomService)
        TicketStatus.Accepted -> StatusVisual("Accepted", Tone.Info, Icons.Rounded.HourglassTop)
        TicketStatus.Preparing -> StatusVisual("Preparing", Tone.Warning, Icons.Rounded.LocalFireDepartment)
        TicketStatus.Ready -> StatusVisual("Ready", Tone.Success, Icons.Rounded.TaskAlt)
        TicketStatus.Completed -> StatusVisual("Served", Tone.Neutral, Icons.Rounded.CheckCircle)
        TicketStatus.Cancelled -> StatusVisual("Cancelled", Tone.Danger, Icons.Rounded.DoNotDisturbOn)
        TicketStatus.Unknown -> StatusVisual("Unknown", Tone.Neutral, Icons.Rounded.HelpOutline)
    }

val OrderItemStatus.visual: StatusVisual
    get() = when (this) {
        OrderItemStatus.Pending -> StatusVisual("Not sent", Tone.Warning, Icons.Rounded.Moving)
        OrderItemStatus.Sent -> StatusVisual("In kitchen", Tone.Info, Icons.Rounded.RoomService)
        OrderItemStatus.Preparing -> StatusVisual("Preparing", Tone.Warning, Icons.Rounded.LocalFireDepartment)
        OrderItemStatus.Ready -> StatusVisual("Ready", Tone.Success, Icons.Rounded.TaskAlt)
        OrderItemStatus.Served -> StatusVisual("Served", Tone.Neutral, Icons.Rounded.CheckCircle)
        OrderItemStatus.Voided -> StatusVisual("Voided", Tone.Danger, Icons.Rounded.Undo)
        OrderItemStatus.Unknown -> StatusVisual("Unknown", Tone.Neutral, Icons.Rounded.HelpOutline)
    }

val OrderStatus.visual: StatusVisual
    get() = when (this) {
        OrderStatus.Open -> StatusVisual("Open", Tone.Accent, Icons.Rounded.RoomService)
        OrderStatus.Billed -> StatusVisual("Bill issued", Tone.Info, Icons.Rounded.HourglassTop)
        OrderStatus.Closed -> StatusVisual("Closed", Tone.Success, Icons.Rounded.CheckCircle)
        OrderStatus.Cancelled -> StatusVisual("Cancelled", Tone.Danger, Icons.Rounded.DoNotDisturbOn)
        OrderStatus.Merged -> StatusVisual("Merged", Tone.Neutral, Icons.Rounded.Moving)
        OrderStatus.Unknown -> StatusVisual("Unknown", Tone.Neutral, Icons.Rounded.HelpOutline)
    }

val BillStatus.visual: StatusVisual
    get() = when (this) {
        BillStatus.Open -> StatusVisual("Awaiting payment", Tone.Warning, Icons.Rounded.HourglassTop)
        BillStatus.Paid -> StatusVisual("Paid", Tone.Success, Icons.Rounded.CheckCircle)
        BillStatus.PartiallyRefunded -> StatusVisual("Part refunded", Tone.Info, Icons.Rounded.Undo)
        BillStatus.Refunded -> StatusVisual("Refunded", Tone.Neutral, Icons.Rounded.Undo)
        BillStatus.Void -> StatusVisual("Void", Tone.Danger, Icons.Rounded.DoNotDisturbOn)
        BillStatus.Unknown -> StatusVisual("Unknown", Tone.Neutral, Icons.Rounded.HelpOutline)
    }

/** How late a kitchen ticket is. Thresholds are deliberately few: calm, then warm, then hot. */
enum class Urgency(val tone: Tone) { Calm(Tone.Neutral), Warm(Tone.Warning), Hot(Tone.Danger) }

fun urgencyFor(minutes: Long): Urgency = when {
    minutes >= 20 -> Urgency.Hot
    minutes >= 10 -> Urgency.Warm
    else -> Urgency.Calm
}
