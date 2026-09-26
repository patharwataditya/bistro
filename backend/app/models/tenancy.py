from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.enums import TableStatus, check_in


class Restaurant(TimestampMixin, Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class Location(TimestampMixin, Base):
    """A physical outlet. Owns all operational data and its billing configuration."""

    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("service_charge_percent >= 0 AND service_charge_percent <= 100",
                        name="service_charge_range"),
        CheckConstraint("rounding_increment > 0", name="rounding_positive"),
        CheckConstraint(check_in("status_after_payment", TableStatus), name="after_payment_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="RESTRICT"),
                                               index=True)
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(300))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    currency_code: Mapped[str] = mapped_column(String(3), default="USD")
    service_charge_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    service_charge_taxable: Mapped[bool] = mapped_column(Boolean, default=True)
    rounding_increment: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.01"))
    bill_prefix: Mapped[str] = mapped_column(String(12), default="B")
    next_bill_number: Mapped[int] = mapped_column(Integer, default=1)
    next_order_number: Mapped[int] = mapped_column(Integer, default=1)
    next_ticket_number: Mapped[int] = mapped_column(Integer, default=1)
    status_after_payment: Mapped[str] = mapped_column(String(16), default=TableStatus.CLEANING)
    version: Mapped[int] = mapped_column(Integer, default=1)

    restaurant: Mapped[Restaurant] = relationship()
    tax_rates: Mapped[list["TaxRate"]] = relationship(
        order_by="TaxRate.sort_order", cascade="all, delete-orphan"
    )


class TaxRate(TimestampMixin, Base):
    __tablename__ = "tax_rates"
    __table_args__ = (
        CheckConstraint("rate_percent >= 0 AND rate_percent <= 100", name="rate_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    name: Mapped[str] = mapped_column(String(60))
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class PaymentMethod(TimestampMixin, Base):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    name: Mapped[str] = mapped_column(String(40))
    is_cash: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
