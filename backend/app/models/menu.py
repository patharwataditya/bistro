from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin


class MenuCategory(TimestampMixin, Base):
    __tablename__ = "menu_categories"
    __table_args__ = (
        Index("uq_menu_categories_location_name", "location_id", text("lower(name)"), unique=True,
              postgresql_where=text("is_active")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    name: Mapped[str] = mapped_column(String(60))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MenuItem(TimestampMixin, Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price >= 0", name="price_non_negative"),
        Index("uq_menu_items_location_name", "location_id", text("lower(name)"), unique=True,
              postgresql_where=text("is_active")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("menu_categories.id",
                                                        ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(300))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)

    category: Mapped[MenuCategory] = relationship()
