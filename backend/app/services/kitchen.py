from datetime import timedelta

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import Actor
from app.core.errors import InvalidTransition, NotFound
from app.models import KitchenTicket, Order
from app.models.enums import ACTIVE_TICKET_STATUSES, OrderItemStatus, OrderStatus, TicketStatus
from app.schemas.kitchen import KitchenBoardOut, TicketItemOut, TicketOut
from app.services.common import bump, check_version, now

TRANSITIONS: dict[TicketStatus, frozenset[TicketStatus]] = {
    TicketStatus.NEW: frozenset({TicketStatus.ACCEPTED, TicketStatus.PREPARING}),
    TicketStatus.ACCEPTED: frozenset({TicketStatus.PREPARING}),
    TicketStatus.PREPARING: frozenset({TicketStatus.READY}),
    TicketStatus.READY: frozenset({TicketStatus.COMPLETED, TicketStatus.PREPARING}),
    TicketStatus.COMPLETED: frozenset(),
    TicketStatus.CANCELLED: frozenset(),
}

# What a ticket transition does to the (non-voided) items on it.
_ITEM_EFFECT: dict[TicketStatus, tuple[frozenset[OrderItemStatus], OrderItemStatus]] = {
    TicketStatus.PREPARING: (frozenset({OrderItemStatus.SENT, OrderItemStatus.READY}),
                             OrderItemStatus.PREPARING),
    TicketStatus.READY: (frozenset({OrderItemStatus.SENT, OrderItemStatus.PREPARING}),
                         OrderItemStatus.READY),
    TicketStatus.COMPLETED: (frozenset({OrderItemStatus.SENT, OrderItemStatus.PREPARING,
                                        OrderItemStatus.READY}), OrderItemStatus.SERVED),
}

RECENT_WINDOW = timedelta(minutes=30)


def to_out(ticket: KitchenTicket) -> TicketOut:
    order = ticket.order
    return TicketOut(
        id=ticket.id, ticket_number=ticket.ticket_number, status=ticket.status,
        order_id=order.id, order_number=order.order_number, order_status=order.status,
        order_notes=order.notes, table_name=order.table.name,
        server_name=order.server.full_name, fired_at=ticket.fired_at,
        accepted_at=ticket.accepted_at, started_at=ticket.started_at, ready_at=ticket.ready_at,
        completed_at=ticket.completed_at,
        items=[TicketItemOut(id=i.id, name=i.name, quantity=i.quantity, notes=i.notes,
                             status=i.status) for i in ticket.items],
        version=ticket.version,
    )


def board(db: Session, actor: Actor, *, include_recent: bool) -> KitchenBoardOut:
    condition: ColumnElement[bool] = KitchenTicket.status.in_(ACTIVE_TICKET_STATUSES)
    if include_recent:
        condition = or_(condition, (KitchenTicket.status == TicketStatus.COMPLETED)
                        & (KitchenTicket.completed_at >= now() - RECENT_WINDOW))
    tickets = db.scalars(
        select(KitchenTicket)
        .options(joinedload(KitchenTicket.order).joinedload(Order.table),
                 joinedload(KitchenTicket.order).joinedload(Order.server))
        .where(KitchenTicket.location_id == actor.location_id, condition)
        .order_by(KitchenTicket.fired_at, KitchenTicket.id)
    ).unique()
    return KitchenBoardOut(tickets=[to_out(t) for t in tickets], server_time=now())


def get_ticket(db: Session, actor: Actor, ticket_id: int, *, lock: bool = False) -> KitchenTicket:
    stmt = select(KitchenTicket).where(KitchenTicket.id == ticket_id,
                                       KitchenTicket.location_id == actor.location_id)
    if lock:
        stmt = stmt.with_for_update(of=KitchenTicket).execution_options(populate_existing=True)
    ticket = db.scalar(stmt)
    if ticket is None:
        raise NotFound("Ticket not found.")
    return ticket


def transition(db: Session, actor: Actor, ticket_id: int, to: TicketStatus,
               version: int) -> KitchenTicket:
    # Lock order before ticket: the same order every other path (void, serve, fire) uses,
    # so concurrent kitchen and floor actions queue instead of deadlocking.
    order_id = get_ticket(db, actor, ticket_id).order_id
    db.scalar(select(Order).where(Order.id == order_id)
              .with_for_update(of=Order).execution_options(populate_existing=True))
    ticket = get_ticket(db, actor, ticket_id, lock=True)
    db.refresh(ticket)
    db.refresh(ticket, attribute_names=["items"])
    current = TicketStatus(ticket.status)
    if current == to:
        # A double-tap or a retry of a request that already landed: report the state as-is.
        return ticket
    check_version(ticket, version, "ticket")
    if ticket.order.status in (OrderStatus.CANCELLED,) or current == TicketStatus.CANCELLED:
        raise InvalidTransition("This ticket was cancelled.")
    if to not in TRANSITIONS[current]:
        raise InvalidTransition(f"A {current.lower()} ticket can't be marked {to.lower()}.",
                                details={"from": current, "to": to})
    stamp = now()
    if to == TicketStatus.ACCEPTED:
        ticket.accepted_at = stamp
    elif to == TicketStatus.PREPARING:
        ticket.started_at = ticket.started_at or stamp
        ticket.ready_at = None
    elif to == TicketStatus.READY:
        ticket.ready_at = stamp
    elif to == TicketStatus.COMPLETED:
        ticket.completed_at = stamp
    effect = _ITEM_EFFECT.get(to)
    if effect is not None:
        sources, target = effect
        for item in ticket.items:
            if item.status in sources:
                item.status = target
    ticket.status = to
    bump(ticket)
    # Item changes alter what the order screen shows; invalidate stale order edits too.
    bump(ticket.order)
    return ticket
