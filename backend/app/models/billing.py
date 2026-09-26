from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
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
from app.models.enums import BillStatus, DiscountType, PaymentKind, check_in

MONEY = Numeric(12, 2)


class Bill(TimestampMixin, Base):
    """Authoritative, server-computed totals for an order. One non-void bill per order."""

    __tablename__ = "bills"
    __table_args__ = (
        CheckConstraint(check_in("status", BillStatus), name="status_valid"),
        CheckConstraint(
            f"discount_type IS NULL OR {check_in('discount_type', DiscountType)}",
            name="discount_type_valid",
        ),
        CheckConstraint("subtotal >= 0 AND discount_amount >= 0 AND total >= 0",
                        name="amounts_non_negative"),
        CheckConstraint("discount_amount <= subtotal", name="discount_le_subtotal"),
        CheckConstraint("paid_total >= 0 AND refunded_total >= 0 AND refunded_total <= paid_total",
                        name="paid_refunded_range"),
        UniqueConstraint("location_id", "bill_number", name="uq_bills_location_number"),
        Index("uq_bills_order_live", "order_id", unique=True,
              postgresql_where=text("status <> 'VOID'")),
        Index("ix_bills_location_status", "location_id", "status"),
        Index("ix_bills_location_paid_at", "location_id", "paid_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    bill_number: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(20), default=BillStatus.OPEN)
    currency_code: Mapped[str] = mapped_column(String(3))
    subtotal: Mapped[Decimal] = mapped_column(MONEY)
    discount_type: Mapped[str | None] = mapped_column(String(10))
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    discount_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    discount_reason: Mapped[str | None] = mapped_column(String(200))
    service_charge_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    service_charge_amount: Mapped[Decimal] = mapped_column(MONEY)
    service_charge_taxable: Mapped[bool] = mapped_column(Boolean)
    rounding_increment: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    tax_total: Mapped[Decimal] = mapped_column(MONEY)
    round_off: Mapped[Decimal] = mapped_column(MONEY)
    total: Mapped[Decimal] = mapped_column(MONEY)
    paid_total: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    refunded_total: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)

    taxes: Mapped[list["BillTax"]] = relationship(order_by="BillTax.id", lazy="selectin",
                                                  cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(order_by="Payment.id", lazy="selectin")
    order = relationship("Order", lazy="joined")

    @property
    def balance_due(self) -> Decimal:
        return max(self.total - self.paid_total, Decimal("0"))


class BillTax(Base):
    __tablename__ = "bill_taxes"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3))
    taxable_amount: Mapped[Decimal] = mapped_column(MONEY)
    amount: Mapped[Decimal] = mapped_column(MONEY)


class Payment(Base):
    """An immutable money movement against a bill: a payment in or a refund out."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(check_in("kind", PaymentKind), name="kind_valid"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("tendered IS NULL OR tendered >= amount", name="tendered_covers_amount"),
        Index("ix_payments_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id", ondelete="RESTRICT"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    payment_method_id: Mapped[int] = mapped_column(ForeignKey("payment_methods.id",
                                                              ondelete="RESTRICT"))
    method_name: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(MONEY)
    tendered: Mapped[Decimal | None] = mapped_column(MONEY)
    change_due: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    reference: Mapped[str | None] = mapped_column(String(80))
    reason: Mapped[str | None] = mapped_column(String(200))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
