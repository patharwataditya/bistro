from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.models.enums import TableStatus, check_in


class TableArea(TimestampMixin, Base):
    __tablename__ = "table_areas"
    __table_args__ = (
        Index("uq_table_areas_location_name", "location_id", text("lower(name)"), unique=True,
              postgresql_where=text("is_active")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    name: Mapped[str] = mapped_column(String(60))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class DiningTable(TimestampMixin, Base):
    __tablename__ = "dining_tables"
    __table_args__ = (
        CheckConstraint(check_in("status", TableStatus), name="status_valid"),
        CheckConstraint("capacity BETWEEN 1 AND 50", name="capacity_range"),
        Index("uq_dining_tables_location_name", "location_id", text("lower(name)"), unique=True,
              postgresql_where=text("is_active")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"),
                                             index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("table_areas.id", ondelete="SET NULL"),
                                                index=True)
    name: Mapped[str] = mapped_column(String(20))
    capacity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default=TableStatus.AVAILABLE)
    status_note: Mapped[str | None] = mapped_column(String(120))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    area: Mapped[TableArea | None] = relationship()
