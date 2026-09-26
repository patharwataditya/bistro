from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import Conflict, InvalidTransition, NotFound
from app.models import Bill, DiningTable, Order, OrderItem, TableArea, User
from app.models.enums import ACTIVE_ORDER_STATUSES, BillStatus, OrderItemStatus, TableStatus
from app.schemas.floor import (
    ActiveOrderBrief,
    AreaIn,
    AreaOut,
    AreaUpdate,
    FloorOut,
    TableIn,
    TableOut,
    TableStatusIn,
    TableUpdate,
)
from app.services import audit
from app.services.common import bump, check_version, now

# ---------- areas ----------


def list_areas(db: Session, actor: Actor) -> list[TableArea]:
    return list(db.scalars(select(TableArea)
                           .where(TableArea.location_id == actor.location_id, TableArea.is_active)
                           .order_by(TableArea.sort_order, TableArea.name)))


def _get_area(db: Session, actor: Actor, area_id: int) -> TableArea:
    area = db.scalar(select(TableArea).where(TableArea.id == area_id,
                                             TableArea.location_id == actor.location_id,
                                             TableArea.is_active))
    if area is None:
        raise NotFound("Area not found.")
    return area


def _flush_unique(db: Session, message: str) -> None:
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError as exc:
        raise Conflict(message, details={"field": "name"}) from exc


def create_area(db: Session, actor: Actor, data: AreaIn) -> TableArea:
    area = TableArea(location_id=actor.location_id, name=data.name, sort_order=data.sort_order)
    db.add(area)
    _flush_unique(db, "An area with that name already exists.")
    audit.record(db, actor, "area.created", "table_area", area.id, f"Created area {area.name}")
    return area


def update_area(db: Session, actor: Actor, area_id: int, data: AreaUpdate) -> TableArea:
    area = _get_area(db, actor, area_id)
    if data.name is not None:
        area.name = data.name
    if data.sort_order is not None:
        area.sort_order = data.sort_order
    _flush_unique(db, "An area with that name already exists.")
    return area


def delete_area(db: Session, actor: Actor, area_id: int) -> None:
    area = _get_area(db, actor, area_id)
    in_use = db.scalar(select(func.count()).where(DiningTable.area_id == area.id,
                                                  DiningTable.is_active)) or 0
    if in_use:
        raise Conflict(f"{in_use} table(s) are in this area. Move or remove them first.")
    area.is_active = False
    audit.record(db, actor, "area.deleted", "table_area", area.id, f"Removed area {area.name}")


# ---------- tables ----------


def get_table(db: Session, actor: Actor, table_id: int, *, lock: bool = False) -> DiningTable:
    stmt = select(DiningTable).where(DiningTable.id == table_id,
                                     DiningTable.location_id == actor.location_id,
                                     DiningTable.is_active)
    if lock:
        stmt = stmt.with_for_update(of=DiningTable, key_share=True).execution_options(populate_existing=True)
    table = db.scalar(stmt)
    if table is None:
        raise NotFound("Table not found.")
    return table


def active_order_for_table(db: Session, table_id: int) -> Order | None:
    return db.scalar(select(Order).where(Order.table_id == table_id,
                                         Order.status.in_(ACTIVE_ORDER_STATUSES)))


def floor(db: Session, actor: Actor) -> FloorOut:
    """The whole floor in three queries, whatever the number of tables."""
    areas = list_areas(db, actor)
    area_names = {a.id: a.name for a in areas}
    tables = list(db.scalars(select(DiningTable)
                             .where(DiningTable.location_id == actor.location_id,
                                    DiningTable.is_active)
                             .order_by(DiningTable.sort_order, DiningTable.name)))

    live = OrderItem.status != OrderItemStatus.VOIDED
    item_stats = (
        select(
            OrderItem.order_id,
            func.coalesce(func.sum(case((live, OrderItem.quantity), else_=0)), 0).label("n"),
            func.coalesce(func.sum(case((OrderItem.status == OrderItemStatus.PENDING,
                                         OrderItem.quantity), else_=0)), 0).label("pending"),
            func.coalesce(func.sum(case((OrderItem.status == OrderItemStatus.READY,
                                         OrderItem.quantity), else_=0)), 0).label("ready"),
            func.coalesce(func.sum(case((live, OrderItem.unit_price * OrderItem.quantity),
                                        else_=0)), 0).label("subtotal"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )
    rows = db.execute(
        select(Order, User.full_name, item_stats.c.n, item_stats.c.pending, item_stats.c.ready,
               item_stats.c.subtotal, Bill.id)
        .join(User, User.id == Order.server_id)
        .outerjoin(item_stats, item_stats.c.order_id == Order.id)
        .outerjoin(Bill, (Bill.order_id == Order.id) & (Bill.status != BillStatus.VOID))
        .where(Order.location_id == actor.location_id, Order.status.in_(ACTIVE_ORDER_STATUSES))
    ).all()
    by_table: dict[int, ActiveOrderBrief] = {}
    for order, server_name, n, pending, ready, subtotal, bill_id in rows:
        by_table[order.table_id] = ActiveOrderBrief(
            id=order.id, order_number=order.order_number, status=order.status,
            guest_count=order.guest_count, opened_at=order.opened_at, server_name=server_name,
            item_count=int(n or 0), pending_count=int(pending or 0), ready_count=int(ready or 0),
            subtotal=Decimal(subtotal or 0).quantize(Decimal("0.01")), bill_id=bill_id,
            version=order.version,
        )
    return FloorOut(
        areas=[AreaOut.model_validate(a) for a in areas],
        tables=[to_table_out(t, area_names.get(t.area_id) if t.area_id else None,
                             by_table.get(t.id)) for t in tables],
        server_time=now(),
    )


def to_table_out(table: DiningTable, area_name: str | None,
                 active: ActiveOrderBrief | None) -> TableOut:
    return TableOut(id=table.id, name=table.name, capacity=table.capacity, area_id=table.area_id,
                    area_name=area_name, status=table.status, status_note=table.status_note,
                    sort_order=table.sort_order, version=table.version, active_order=active)


def table_out(db: Session, actor: Actor, table: DiningTable) -> TableOut:
    return next(t for t in floor(db, actor).tables if t.id == table.id)


def create_table(db: Session, actor: Actor, data: TableIn) -> DiningTable:
    if data.area_id is not None:
        _get_area(db, actor, data.area_id)
    table = DiningTable(location_id=actor.location_id, name=data.name, capacity=data.capacity,
                        area_id=data.area_id, sort_order=data.sort_order)
    db.add(table)
    _flush_unique(db, "A table with that name already exists.")
    audit.record(db, actor, "table.created", "table", table.id, f"Added table {table.name}")
    return table


def update_table(db: Session, actor: Actor, table_id: int, data: TableUpdate) -> DiningTable:
    table = get_table(db, actor, table_id, lock=True)
    check_version(table, data.version, "table")
    if data.name is not None:
        table.name = data.name
    if data.capacity is not None:
        table.capacity = data.capacity
    if data.clear_area:
        table.area_id = None
    elif data.area_id is not None:
        table.area_id = _get_area(db, actor, data.area_id).id
    if data.sort_order is not None:
        table.sort_order = data.sort_order
    bump(table)
    _flush_unique(db, "A table with that name already exists.")
    return table


def delete_table(db: Session, actor: Actor, table_id: int) -> None:
    table = get_table(db, actor, table_id, lock=True)
    if active_order_for_table(db, table.id) is not None:
        raise InvalidTransition("This table has an open order. Close or move it first.")
    table.is_active = False
    bump(table)
    audit.record(db, actor, "table.deleted", "table", table.id, f"Removed table {table.name}")


def set_status(db: Session, actor: Actor, table_id: int, data: TableStatusIn) -> DiningTable:
    table = get_table(db, actor, table_id, lock=True)
    check_version(table, data.version, "table")
    if table.status == TableStatus.OCCUPIED or active_order_for_table(db, table.id) is not None:
        raise InvalidTransition("This table has an open order. Close or move the order first.")
    previous = table.status
    table.status = data.status
    table.status_note = data.note if data.status != TableStatus.AVAILABLE else None
    bump(table)
    audit.record(db, actor, "table.status_changed", "table", table.id,
                 f"Table {table.name}: {previous} → {data.status}", note=data.note)
    return table


def occupy(table: DiningTable) -> None:
    table.status = TableStatus.OCCUPIED
    table.status_note = None
    bump(table)


def release(table: DiningTable, *, used: bool, after_payment_status: str | None = None) -> None:
    """Free a table whose order ended. A table that was eaten at needs clearing first."""
    if after_payment_status is not None:
        table.status = after_payment_status
    else:
        table.status = TableStatus.CLEANING if used else TableStatus.AVAILABLE
    table.status_note = None
    bump(table)
