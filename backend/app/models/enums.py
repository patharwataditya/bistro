from enum import StrEnum


class TableStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"
    CLEANING = "CLEANING"
    BLOCKED = "BLOCKED"


class OrderStatus(StrEnum):
    OPEN = "OPEN"
    BILLED = "BILLED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    MERGED = "MERGED"


ACTIVE_ORDER_STATUSES = (OrderStatus.OPEN, OrderStatus.BILLED)


class OrderItemStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    PREPARING = "PREPARING"
    READY = "READY"
    SERVED = "SERVED"
    VOIDED = "VOIDED"


class TicketStatus(StrEnum):
    NEW = "NEW"
    ACCEPTED = "ACCEPTED"
    PREPARING = "PREPARING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


ACTIVE_TICKET_STATUSES = (
    TicketStatus.NEW,
    TicketStatus.ACCEPTED,
    TicketStatus.PREPARING,
    TicketStatus.READY,
)


class BillStatus(StrEnum):
    OPEN = "OPEN"
    PAID = "PAID"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"
    REFUNDED = "REFUNDED"
    VOID = "VOID"


class DiscountType(StrEnum):
    PERCENT = "PERCENT"
    FIXED = "FIXED"


class PaymentKind(StrEnum):
    PAYMENT = "PAYMENT"
    REFUND = "REFUND"


def check_in(column: str, enum: type[StrEnum]) -> str:
    """SQL CHECK expression restricting a VARCHAR column to an enum's values."""
    values = ", ".join(f"'{m.value}'" for m in enum)
    return f"{column} IN ({values})"
