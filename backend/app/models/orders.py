from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.enums import OrderItemStatus, OrderStatus, TicketStatus, check_in


class Order(TimestampMixin, Base):
    """A check for one table visit. At most one active (OPEN/BILLED) order per table."""

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(check_in("status", OrderStatus), name="status_valid"),
        CheckConstraint("guest_count BETWEEN 1 AND 100", name="guest_count_range"),
        UniqueConstraint("location_id", "order_number", name="uq_orders_location_number"),
        Index("uq_orders_active_table", "table_id", unique=True,
              postgresql_where=text("status IN ('OPEN', 'BILLED')")),
        Index("ix_orders_location_status", "location_id", "status"),
        Index("ix_orders_location_opened", "location_id", "opened_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    order_number: Mapped[int] = mapped_column(Integer)
    table_id: Mapped[int] = mapped_column(ForeignKey("dining_tables.id", ondelete="RESTRICT"),
                                          index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=OrderStatus.OPEN)
    guest_count: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str | None] = mapped_column(String(300))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    billed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    merged_into_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id",
                                                                  ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer, default=1)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", order_by="OrderItem.id", lazy="selectin",
        foreign_keys="OrderItem.order_id",
    )
    table = relationship("DiningTable", lazy="joined")
    server = relationship("User", lazy="joined")


class KitchenTicket(TimestampMixin, Base):
    """One 'fire' of items to the kitchen."""

    __tablename__ = "kitchen_tickets"
    __table_args__ = (
        CheckConstraint(check_in("status", TicketStatus), name="status_valid"),
        UniqueConstraint("location_id", "ticket_number", name="uq_tickets_location_number"),
        Index("ix_kitchen_tickets_location_status", "location_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    ticket_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default=TicketStatus.NEW)
    fired_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)

    order: Mapped[Order] = relationship(lazy="joined")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="ticket",
                                                    order_by="OrderItem.id", lazy="selectin")


class OrderItem(TimestampMixin, Base):
    """A line on an order. Name and price are snapshots: menu edits never rewrite history."""

    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint(check_in("status", OrderItemStatus), name="status_valid"),
        CheckConstraint("quantity BETWEEN 1 AND 999", name="quantity_range"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("(status = 'PENDING') = (ticket_id IS NULL)", name="ticket_iff_fired"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="RESTRICT"),
                                              index=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("kitchen_tickets.id",
                                                             ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(16), default=OrderItemStatus.PENDING)
    added_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(200))

    order: Mapped[Order] = relationship(back_populates="items", foreign_keys=[order_id])
    ticket: Mapped[KitchenTicket | None] = relationship(back_populates="items")

    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.quantity
