"""Order lifecycle. See ARCHITECTURE §6 for the state machines enforced here."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Select, case, func, select, update
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import InvalidTransition, NotFound, PermissionDenied, ValidationFailed
from app.models import Bill, DiningTable, KitchenTicket, Location, MenuItem, Order, OrderItem, User
from app.models.enums import (
    ACTIVE_ORDER_STATUSES,
    BillStatus,
    OrderItemStatus,
    OrderStatus,
    TableStatus,
    TicketStatus,
)
from app.schemas.orders import (
    AddItemsIn,
    CancelOrderIn,
    ItemUpdate,
    MergeIn,
    OrderCreate,
    OrderItemIn,
    OrderItemOut,
    OrderOut,
    OrderSummary,
    OrderUpdate,
    SplitIn,
    TaxLineOut,
    TotalsOut,
    TransferIn,
)
from app.services import audit, floor, money
from app.services.common import bump, check_version, now
from app.services.settings import active_tax_rates

SEATABLE = (TableStatus.AVAILABLE, TableStatus.RESERVED, TableStatus.CLEANING)
FIRED = (OrderItemStatus.SENT, OrderItemStatus.PREPARING, OrderItemStatus.READY,
         OrderItemStatus.SERVED)


# ---------- loading ----------

def get_order(db: Session, actor: Actor, order_id: int, *, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id, Order.location_id == actor.location_id)
    if lock:
        stmt = stmt.with_for_update(of=Order).execution_options(populate_existing=True)
    order = db.scalar(stmt)
    if order is None:
        raise NotFound("Order not found.")
    if lock:
        db.refresh(order, attribute_names=["items"])
    return order


def live_items(order: Order) -> list[OrderItem]:
    return [i for i in order.items if i.status != OrderItemStatus.VOIDED]


def _next_number(db: Session, location_id: int, field: str) -> int:
    location = db.scalar(select(Location).where(Location.id == location_id)
                         .with_for_update().execution_options(populate_existing=True))
    assert location is not None
    value: int = getattr(location, field)
    setattr(location, field, value + 1)
    return value


def _require_status(order: Order, *allowed: OrderStatus, action: str) -> None:
    if order.status not in allowed:
        messages = {
            OrderStatus.BILLED: "The bill has been issued. Void the bill to change this order.",
            OrderStatus.CLOSED: "This order is closed.",
            OrderStatus.CANCELLED: "This order was cancelled.",
            OrderStatus.MERGED: "This order was merged into another order.",
            OrderStatus.OPEN: "This order is still open.",
        }
        raise InvalidTransition(f"Can't {action}. {messages[OrderStatus(order.status)]}",
                                details={"status": order.status})


# ---------- presentation ----------

def totals_for(db: Session, order: Order, bill: Bill | None = None) -> TotalsOut:
    if bill is not None:
        return TotalsOut(
            subtotal=bill.subtotal, discount_amount=bill.discount_amount,
            service_charge_percent=bill.service_charge_percent,
            service_charge_amount=bill.service_charge_amount,
            taxes=[TaxLineOut.model_validate(t) for t in bill.taxes], tax_total=bill.tax_total,
            round_off=bill.round_off, total=bill.total,
        )
    location = db.get(Location, order.location_id)
    assert location is not None
    breakdown = money.compute(
        [i.line_total for i in live_items(order)], discount_type=None, discount_value=None,
        service_charge_percent=location.service_charge_percent,
        service_charge_taxable=location.service_charge_taxable,
        taxes=[(t.name, t.rate_percent) for t in active_tax_rates(db, location.id)],
        rounding_increment=location.rounding_increment,
    )
    return breakdown_out(breakdown)


def breakdown_out(b: money.Breakdown) -> TotalsOut:
    return TotalsOut(
        subtotal=b.subtotal, discount_amount=b.discount_amount,
        service_charge_percent=b.service_charge_percent,
        service_charge_amount=b.service_charge_amount,
        taxes=[TaxLineOut(name=t.name, rate_percent=t.rate_percent,
                          taxable_amount=t.taxable_amount, amount=t.amount) for t in b.taxes],
        tax_total=b.tax_total, round_off=b.round_off, total=b.total,
    )


def live_bill(db: Session, order_id: int) -> Bill | None:
    return db.scalar(select(Bill).where(Bill.order_id == order_id, Bill.status != BillStatus.VOID))


def to_out(db: Session, actor: Actor, order: Order) -> OrderOut:
    db.flush()
    db.refresh(order, attribute_names=["items"])
    bill = live_bill(db, order.id)
    return OrderOut(
        id=order.id, order_number=order.order_number, status=order.status,
        table_id=order.table_id, table_name=order.table.name, server_id=order.server_id,
        server_name=order.server.full_name, guest_count=order.guest_count, notes=order.notes,
        opened_at=order.opened_at, billed_at=order.billed_at, closed_at=order.closed_at,
        cancelled_at=order.cancelled_at, cancel_reason=order.cancel_reason,
        merged_into_id=order.merged_into_id,
        items=[OrderItemOut(
            id=i.id, menu_item_id=i.menu_item_id, name=i.name, unit_price=i.unit_price,
            quantity=i.quantity, line_total=i.line_total, notes=i.notes, status=i.status,
            ticket_id=i.ticket_id, void_reason=i.void_reason, created_at=i.created_at,
        ) for i in order.items],
        totals=totals_for(db, order, bill), bill_id=bill.id if bill else None,
        currency_code=actor.location.currency_code, version=order.version,
    )


def list_orders(db: Session, actor: Actor, *, statuses: list[OrderStatus] | None,
                table_id: int | None, since: datetime | None, limit: int,
                offset: int) -> tuple[list[OrderSummary], int]:
    live = OrderItem.status != OrderItemStatus.VOIDED
    stats = (select(OrderItem.order_id,
                    func.coalesce(func.sum(case((live, OrderItem.quantity), else_=0)), 0)
                    .label("n"),
                    func.coalesce(func.sum(case((live, OrderItem.unit_price * OrderItem.quantity),
                                                else_=0)), 0).label("subtotal"))
             .group_by(OrderItem.order_id).subquery())
    stmt: Select[Order, str, str, int, Decimal] = (
        select(Order, DiningTable.name, User.full_name, stats.c.n, stats.c.subtotal)
        .join(DiningTable, DiningTable.id == Order.table_id)
        .join(User, User.id == Order.server_id)
        .outerjoin(stats, stats.c.order_id == Order.id)
        .where(Order.location_id == actor.location_id)
    )
    if statuses:
        stmt = stmt.where(Order.status.in_(statuses))
    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)
    if since is not None:
        stmt = stmt.where(Order.opened_at >= since)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(Order.opened_at.desc(), Order.id.desc())
                      .limit(limit).offset(offset)).all()
    return [OrderSummary(
        id=o.id, order_number=o.order_number, status=o.status, table_id=o.table_id,
        table_name=table_name, server_name=server_name, guest_count=o.guest_count,
        opened_at=o.opened_at, closed_at=o.closed_at, item_count=int(n or 0),
        subtotal=money.q(Decimal(subtotal or 0)), version=o.version,
    ) for o, table_name, server_name, n, subtotal in rows], total


# ---------- items ----------

def _add_items(db: Session, actor: Actor, order: Order, items: list[OrderItemIn]) -> None:
    ids = {i.menu_item_id for i in items}
    menu = {m.id: m for m in db.scalars(select(MenuItem).where(
        MenuItem.id.in_(ids), MenuItem.location_id == actor.location_id, MenuItem.is_active))}
    missing = ids - menu.keys()
    if missing:
        raise ValidationFailed("Some items are no longer on the menu.",
                               details={"menu_item_ids": sorted(missing)})
    unavailable = sorted(m.name for m in menu.values() if not m.is_available)
    if unavailable:
        raise ValidationFailed(f"Sold out: {', '.join(unavailable)}.",
                               details={"unavailable": unavailable})
    pending = {(i.menu_item_id, i.notes or ""): i for i in order.items
               if i.status == OrderItemStatus.PENDING}
    for line in items:
        key = (line.menu_item_id, line.notes or "")
        existing = pending.get(key)
        if existing is not None:
            if existing.quantity + line.quantity > 999:
                raise ValidationFailed("That's more than 999 of one item.")
            existing.quantity += line.quantity
            continue
        m = menu[line.menu_item_id]
        item = OrderItem(order_id=order.id, menu_item_id=m.id, name=m.name, unit_price=m.price,
                         quantity=line.quantity, notes=line.notes or None,
                         status=OrderItemStatus.PENDING, added_by_id=actor.id)
        db.add(item)
        order.items.append(item)
        pending[key] = item


def open_order(db: Session, actor: Actor, data: OrderCreate) -> Order:
    table = floor.get_table(db, actor, data.table_id, lock=True)
    if floor.active_order_for_table(db, table.id) is not None:
        raise InvalidTransition(f"Table {table.name} already has an open order.",
                                details={"reason": "TABLE_OCCUPIED"})
    if table.status not in SEATABLE:
        raise InvalidTransition(f"Table {table.name} is {table.status.lower()}. "
                                "Change its status before seating guests.",
                                details={"status": table.status})
    order = Order(location_id=actor.location_id,
                  order_number=_next_number(db, actor.location_id, "next_order_number"),
                  table_id=table.id, server_id=actor.id, status=OrderStatus.OPEN,
                  guest_count=data.guest_count, notes=data.notes)
    db.add(order)
    db.flush()
    floor.occupy(table)
    if data.items:
        _add_items(db, actor, order, data.items)
    audit.record(db, actor, "order.opened", "order", order.id,
                 f"Opened order #{order.order_number} on {table.name}",
                 guests=data.guest_count)
    return order


def add_items(db: Session, actor: Actor, order_id: int, data: AddItemsIn) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="add items")
    _add_items(db, actor, order, data.items)
    bump(order)
    return order


def _get_item(order: Order, item_id: int) -> OrderItem:
    item = next((i for i in order.items if i.id == item_id), None)
    if item is None:
        raise NotFound("Item not found on this order.")
    return item


def update_item(db: Session, actor: Actor, order_id: int, item_id: int,
                data: ItemUpdate) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="edit items")
    item = _get_item(order, item_id)
    if item.status != OrderItemStatus.PENDING:
        raise InvalidTransition("This item was already sent to the kitchen. Void it instead.")
    if data.quantity is not None:
        item.quantity = data.quantity
    if "notes" in data.model_fields_set:
        item.notes = data.notes or None
    bump(order)
    return order


def remove_pending_item(db: Session, actor: Actor, order_id: int, item_id: int) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="remove items")
    item = _get_item(order, item_id)
    if item.status != OrderItemStatus.PENDING:
        raise InvalidTransition("This item was already sent to the kitchen. Void it instead.")
    order.items.remove(item)
    db.delete(item)
    bump(order)
    return order


def void_item(db: Session, actor: Actor, order_id: int, item_id: int, reason: str) -> Order:
    """Void a fired item (comp, mistake, returned). Needs orders.cancel; audited."""
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="void items")
    item = _get_item(order, item_id)
    if item.status == OrderItemStatus.VOIDED:
        raise InvalidTransition("This item is already voided.")
    if item.status == OrderItemStatus.PENDING:
        raise InvalidTransition("This item hasn't been sent. Remove it instead.")
    item.status = OrderItemStatus.VOIDED
    item.voided_at = now()
    item.void_reason = reason
    if item.ticket_id is not None:
        _cancel_ticket_if_empty(db, item.ticket_id)
    bump(order)
    audit.record(db, actor, "order.item_voided", "order", order.id,
                 f"Voided {item.quantity}× {item.name} on #{order.order_number}",
                 item_id=item.id, amount=item.line_total, reason=reason)
    return order


def mark_served(db: Session, actor: Actor, order_id: int, item_id: int) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, OrderStatus.BILLED, OrderStatus.CLOSED,
                    action="serve items")
    item = _get_item(order, item_id)
    if item.status != OrderItemStatus.READY:
        raise InvalidTransition("Only items marked ready by the kitchen can be served.")
    item.status = OrderItemStatus.SERVED
    if item.ticket_id is not None:
        ticket = db.scalar(select(KitchenTicket).where(KitchenTicket.id == item.ticket_id)
                           .with_for_update(of=KitchenTicket)
                           .execution_options(populate_existing=True))
        assert ticket is not None
        db.refresh(ticket, attribute_names=["items"])
        remaining = [i for i in ticket.items
                     if i.status not in (OrderItemStatus.SERVED, OrderItemStatus.VOIDED)]
        if not remaining and ticket.status == TicketStatus.READY:
            ticket.status = TicketStatus.COMPLETED
            ticket.completed_at = now()
            bump(ticket)
    bump(order)
    return order


def _cancel_ticket_if_empty(db: Session, ticket_id: int) -> None:
    ticket = db.scalar(select(KitchenTicket).where(KitchenTicket.id == ticket_id)
                       .with_for_update(of=KitchenTicket)
                       .execution_options(populate_existing=True))
    assert ticket is not None
    db.flush()
    db.refresh(ticket, attribute_names=["items"])
    if ticket.status in (TicketStatus.COMPLETED, TicketStatus.CANCELLED):
        return
    if all(i.status == OrderItemStatus.VOIDED for i in ticket.items):
        ticket.status = TicketStatus.CANCELLED
        ticket.cancelled_at = now()
        bump(ticket)


# ---------- order-level transitions ----------

def fire(db: Session, actor: Actor, order_id: int, version: int) -> Order:
    """Send every pending item to the kitchen as one new ticket."""
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="send to the kitchen")
    check_version(order, version, "order")
    pending = [i for i in order.items if i.status == OrderItemStatus.PENDING]
    if not pending:
        raise InvalidTransition("There's nothing new to send to the kitchen.")
    ticket = KitchenTicket(location_id=actor.location_id, order_id=order.id,
                           ticket_number=_next_number(db, actor.location_id, "next_ticket_number"),
                           status=TicketStatus.NEW, fired_by_id=actor.id)
    db.add(ticket)
    db.flush()
    for item in pending:
        item.status = OrderItemStatus.SENT
        item.ticket_id = ticket.id
    bump(order)
    audit.record(db, actor, "order.fired", "order", order.id,
                 f"Sent {sum(i.quantity for i in pending)} item(s) from #{order.order_number} "
                 f"to the kitchen", ticket_id=ticket.id)
    return order


def update_order(db: Session, actor: Actor, order_id: int, data: OrderUpdate) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, OrderStatus.BILLED, action="edit this order")
    check_version(order, data.version, "order")
    if data.guest_count is not None:
        order.guest_count = data.guest_count
    if "notes" in data.model_fields_set:
        order.notes = data.notes or None
    bump(order)
    return order


def _was_used(order: Order) -> bool:
    return any(i.status in FIRED for i in order.items)


def cancel(db: Session, actor: Actor, order_id: int, data: CancelOrderIn) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="cancel this order")
    check_version(order, data.version, "order")
    fired = [i for i in order.items if i.status in FIRED]
    if fired and not actor.can("orders.cancel"):
        raise PermissionDenied("Items were already sent. A manager needs to cancel this order.",
                               details={"permission": "orders.cancel"})
    table = floor.get_table(db, actor, order.table_id, lock=True)
    used = _was_used(order)
    voided_value = sum((i.line_total for i in fired), Decimal("0"))
    ticket_ids = {i.ticket_id for i in order.items if i.ticket_id is not None}
    for item in list(order.items):
        if item.status == OrderItemStatus.PENDING:
            order.items.remove(item)
            db.delete(item)
        elif item.status != OrderItemStatus.VOIDED:
            item.status = OrderItemStatus.VOIDED
            item.voided_at = now()
            item.void_reason = f"Order cancelled: {data.reason}"
    db.flush()
    for ticket_id in ticket_ids:
        _cancel_ticket_if_empty(db, ticket_id)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = now()
    order.cancel_reason = data.reason
    bump(order)
    floor.release(table, used=used)
    audit.record(db, actor, "order.cancelled", "order", order.id,
                 f"Cancelled order #{order.order_number} on {table.name}", reason=data.reason,
                 voided_value=voided_value)
    return order


def transfer(db: Session, actor: Actor, order_id: int, data: TransferIn) -> Order:
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, OrderStatus.BILLED, action="move this order")
    check_version(order, data.version, "order")
    if data.table_id == order.table_id:
        raise ValidationFailed("The order is already on that table.")
    # Lock both tables in id order so two concurrent moves cannot deadlock.
    first, second = sorted((order.table_id, data.table_id))
    locked = {t.id: t for t in (floor.get_table(db, actor, first, lock=True),
                                floor.get_table(db, actor, second, lock=True))}
    source, target = locked[order.table_id], locked[data.table_id]
    if floor.active_order_for_table(db, target.id) is not None:
        raise InvalidTransition(f"Table {target.name} already has an order. Merge instead.")
    if target.status not in SEATABLE:
        raise InvalidTransition(f"Table {target.name} is {target.status.lower()}.")
    order.table_id = target.id
    db.flush()
    floor.occupy(target)
    floor.release(source, used=_was_used(order))
    bump(order)
    db.refresh(order, attribute_names=["table"])
    audit.record(db, actor, "order.moved", "order", order.id,
                 f"Moved #{order.order_number} from {source.name} to {target.name}")
    return order


def merge(db: Session, actor: Actor, target_order_id: int, data: MergeIn) -> Order:
    """Fold another table's open order into this one; the other table is freed."""
    if data.source_order_id == target_order_id:
        raise ValidationFailed("Can't merge an order into itself.")
    first, second = sorted((target_order_id, data.source_order_id))
    orders = {o.id: o for o in (get_order(db, actor, first, lock=True),
                                get_order(db, actor, second, lock=True))}
    target, source = orders[target_order_id], orders[data.source_order_id]
    _require_status(target, OrderStatus.OPEN, action="merge into this order")
    _require_status(source, OrderStatus.OPEN, action="merge that order")
    check_version(target, data.version, "order")
    check_version(source, data.source_version, "order")
    source_table = floor.get_table(db, actor, source.table_id, lock=True)
    used = _was_used(source)
    moved = 0
    for item in list(source.items):
        item.order_id = target.id
        moved += 1
    db.flush()
    db.execute(update(KitchenTicket)
               .where(KitchenTicket.order_id == source.id).values(order_id=target.id))
    target.guest_count = min(target.guest_count + source.guest_count, 100)
    source.status = OrderStatus.MERGED
    source.merged_into_id = target.id
    source.closed_at = now()
    bump(source)
    bump(target)
    floor.release(source_table, used=used)
    db.flush()
    db.expire(target, ["items"])
    audit.record(db, actor, "order.merged", "order", target.id,
                 f"Merged #{source.order_number} ({source_table.name}) into #{target.order_number}",
                 source_order_id=source.id, items_moved=moved)
    return target


def split(db: Session, actor: Actor, order_id: int, data: SplitIn) -> Order:
    """Move selected items to a new order on a free table. Returns the new order."""
    order = get_order(db, actor, order_id, lock=True)
    _require_status(order, OrderStatus.OPEN, action="split this order")
    check_version(order, data.version, "order")
    wanted = set(data.item_ids)
    items = [i for i in order.items if i.id in wanted]
    if len(items) != len(wanted):
        raise ValidationFailed("Some items aren't on this order.")
    if any(i.status == OrderItemStatus.VOIDED for i in items):
        raise ValidationFailed("Voided items can't be moved.")
    in_flight = (OrderItemStatus.SENT, OrderItemStatus.PREPARING, OrderItemStatus.READY)
    if any(i.status in in_flight for i in items):
        # Their kitchen ticket belongs to this order; moving them would split a ticket
        # across two tables. Serve them first (or move the whole order).
        raise InvalidTransition("Some of those items are still with the kitchen. "
                                "Split them once they're served.")
    if len(items) == len(live_items(order)) and all(i.id in wanted for i in live_items(order)):
        raise ValidationFailed("That's every item. Move the whole order instead.")
    target_table = floor.get_table(db, actor, data.table_id, lock=True)
    if target_table.id == order.table_id:
        raise ValidationFailed("Choose a different table for the split.")
    if floor.active_order_for_table(db, target_table.id) is not None:
        raise InvalidTransition(f"Table {target_table.name} already has an order.")
    if target_table.status not in SEATABLE:
        raise InvalidTransition(f"Table {target_table.name} is {target_table.status.lower()}.")
    new_order = Order(location_id=actor.location_id,
                      order_number=_next_number(db, actor.location_id, "next_order_number"),
                      table_id=target_table.id, server_id=order.server_id,
                      status=OrderStatus.OPEN, guest_count=data.guest_count)
    db.add(new_order)
    db.flush()
    for item in items:
        item.order_id = new_order.id
    floor.occupy(target_table)
    bump(order)
    db.flush()
    db.expire(order, ["items"])
    audit.record(db, actor, "order.split", "order", order.id,
                 f"Split {len(items)} item(s) from #{order.order_number} to "
                 f"#{new_order.order_number} on {target_table.name}", new_order_id=new_order.id)
    return new_order


def active_order_ids(db: Session, location_id: int) -> list[int]:
    return list(db.scalars(select(Order.id).where(Order.location_id == location_id,
                                                  Order.status.in_(ACTIVE_ORDER_STATUSES))))
