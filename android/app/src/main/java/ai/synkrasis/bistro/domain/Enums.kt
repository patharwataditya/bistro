package ai.synkrasis.bistro.domain

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * State values shared with the API. They must match contract/enums.json exactly; a unit test
 * fails the build if either side drifts. Unknown values from a newer server decode to
 * [Unknown] instead of crashing, and the UI renders them neutrally.
 */
interface WireEnum {
    val wire: String
}

abstract class WireEnumSerializer<T>(name: String, private val values: Array<T>, private val unknown: T) :
    KSerializer<T> where T : Enum<T>, T : WireEnum {
    override val descriptor = PrimitiveSerialDescriptor(name, PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: T) = encoder.encodeString(value.wire)
    override fun deserialize(decoder: Decoder): T {
        val raw = decoder.decodeString()
        return values.firstOrNull { it.wire == raw } ?: unknown
    }
}

@Serializable(with = TableStatus.Serializer::class)
enum class TableStatus(override val wire: String) : WireEnum {
    Available("AVAILABLE"), Occupied("OCCUPIED"), Reserved("RESERVED"), Cleaning("CLEANING"),
    Blocked("BLOCKED"), Unknown("");

    /** Statuses staff may set by hand. OCCUPIED is only ever set by opening an order. */
    val manuallySettable: Boolean get() = this in listOf(Available, Reserved, Cleaning, Blocked)

    /** Guests can be seated at these (the server enforces the same list). */
    val seatable: Boolean get() = this in listOf(Available, Reserved, Cleaning)

    object Serializer : WireEnumSerializer<TableStatus>("TableStatus", entries.toTypedArray(), Unknown)
}

@Serializable(with = OrderStatus.Serializer::class)
enum class OrderStatus(override val wire: String) : WireEnum {
    Open("OPEN"), Billed("BILLED"), Closed("CLOSED"), Cancelled("CANCELLED"), Merged("MERGED"), Unknown("");

    val isActive: Boolean get() = this == Open || this == Billed

    object Serializer : WireEnumSerializer<OrderStatus>("OrderStatus", entries.toTypedArray(), Unknown)
}

@Serializable(with = OrderItemStatus.Serializer::class)
enum class OrderItemStatus(override val wire: String) : WireEnum {
    Pending("PENDING"), Sent("SENT"), Preparing("PREPARING"), Ready("READY"), Served("SERVED"),
    Voided("VOIDED"), Unknown("");

    val inKitchen: Boolean get() = this == Sent || this == Preparing

    object Serializer : WireEnumSerializer<OrderItemStatus>("OrderItemStatus", entries.toTypedArray(), Unknown)
}

@Serializable(with = TicketStatus.Serializer::class)
enum class TicketStatus(override val wire: String) : WireEnum {
    New("NEW"), Accepted("ACCEPTED"), Preparing("PREPARING"), Ready("READY"), Completed("COMPLETED"),
    Cancelled("CANCELLED"), Unknown("");

    object Serializer : WireEnumSerializer<TicketStatus>("TicketStatus", entries.toTypedArray(), Unknown)
}

@Serializable(with = BillStatus.Serializer::class)
enum class BillStatus(override val wire: String) : WireEnum {
    Open("OPEN"), Paid("PAID"), PartiallyRefunded("PARTIALLY_REFUNDED"), Refunded("REFUNDED"),
    Void("VOID"), Unknown("");

    val isSettled: Boolean get() = this == Paid || this == PartiallyRefunded || this == Refunded

    object Serializer : WireEnumSerializer<BillStatus>("BillStatus", entries.toTypedArray(), Unknown)
}

@Serializable(with = DiscountType.Serializer::class)
enum class DiscountType(override val wire: String) : WireEnum {
    Percent("PERCENT"), Fixed("FIXED"), Unknown("");

    object Serializer : WireEnumSerializer<DiscountType>("DiscountType", entries.toTypedArray(), Unknown)
}

@Serializable(with = PaymentKind.Serializer::class)
enum class PaymentKind(override val wire: String) : WireEnum {
    Payment("PAYMENT"), Refund("REFUND"), Unknown("");

    object Serializer : WireEnumSerializer<PaymentKind>("PaymentKind", entries.toTypedArray(), Unknown)
}
