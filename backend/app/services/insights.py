"""Dashboard, reports and the audit log. Read-only; day boundaries use the location's zone."""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Integer, Select, case, cast, extract, func, select
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import ValidationFailed
from app.models import AuditLog, Bill, DiningTable, KitchenTicket, Order, OrderItem, Payment, User
from app.models.enums import (
    ACTIVE_ORDER_STATUSES,
    ACTIVE_TICKET_STATUSES,
    BillStatus,
    OrderItemStatus,
    OrderStatus,
    PaymentKind,
    TableStatus,
    TicketStatus,
)
from app.schemas.insights import (
    ActivityOut,
    AuditLogOut,
    AuditPage,
    DailySales,
    DashboardOut,
    HourlySales,
    KitchenCounts,
    NamedAmount,
    ReportOut,
    SalesToday,
    TableCounts,
    TableUsage,
    TopItem,
)
from app.services.common import pairs
from app.services.money import q

ZERO = Decimal("0.00")
PAID_STATES = (BillStatus.PAID, BillStatus.PARTIALLY_REFUNDED, BillStatus.REFUNDED)
MAX_REPORT_DAYS = 366
EARLIEST = date(2000, 1, 1)
LATEST = date(2100, 12, 31)


def _zone(actor: Actor) -> ZoneInfo:
    return ZoneInfo(actor.location.timezone)


def day_bounds(start: date, end: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    """[start 00:00, end+1 00:00) in the location's zone, as UTC instants (DST-safe)."""
    lo = datetime.combine(start, time.min, zone).astimezone(UTC)
    hi = datetime.combine(end + timedelta(days=1), time.min, zone).astimezone(UTC)
    return lo, hi


def _dec(value: object) -> Decimal:
    return q(Decimal(str(value))) if value is not None else ZERO


def _sales_refunds(location_id: int, lo: datetime, hi: datetime) -> Select[Decimal]:
    """Refunds of settled sales in [lo, hi). Refunds that unwound a payment on a still-open
    bill are corrections, not refunds of a sale, and are excluded."""
    return (select(func.coalesce(func.sum(Payment.amount), 0))
            .join(Bill, Bill.id == Payment.bill_id)
            .where(Bill.location_id == location_id, Payment.kind == PaymentKind.REFUND,
                   Payment.is_correction.is_(False),
                   Payment.created_at >= lo, Payment.created_at < hi))


def _net_sales(db: Session, location_id: int, lo: datetime, hi: datetime) -> tuple[Decimal, int]:
    gross, count = db.execute(
        select(func.coalesce(func.sum(Bill.total), 0), func.count())
        .where(Bill.location_id == location_id, Bill.status.in_(PAID_STATES),
               Bill.paid_at >= lo, Bill.paid_at < hi)
    ).one()
    refunds = db.scalar(_sales_refunds(location_id, lo, hi))
    return _dec(gross) - _dec(refunds), int(count)


def dashboard(db: Session, actor: Actor) -> DashboardOut:
    location_id = actor.location_id
    now_utc = datetime.now(UTC)
    today = now_utc.astimezone(_zone(actor)).date()
    out = DashboardOut(server_time=now_utc, business_date=today,
                       currency_code=actor.location.currency_code, tables=None, kitchen=None,
                       open_orders=None, ready_items=None, open_bills=None,
                       open_bills_amount=None, sales_today=None, recent_activity=None)

    if actor.can("tables.view"):
        counts = pairs(db.execute(select(DiningTable.status, func.count())
                                 .where(DiningTable.location_id == location_id,
                                        DiningTable.is_active)
                                 .group_by(DiningTable.status)))
        out.tables = TableCounts(
            total=sum(counts.values()), available=counts.get(TableStatus.AVAILABLE, 0),
            occupied=counts.get(TableStatus.OCCUPIED, 0),
            reserved=counts.get(TableStatus.RESERVED, 0),
            cleaning=counts.get(TableStatus.CLEANING, 0),
            blocked=counts.get(TableStatus.BLOCKED, 0))

    if actor.can("kitchen.view"):
        ticket_counts = pairs(db.execute(select(KitchenTicket.status, func.count())
                                        .where(KitchenTicket.location_id == location_id,
                                               KitchenTicket.status.in_(ACTIVE_TICKET_STATUSES))
                                        .group_by(KitchenTicket.status)))
        oldest = db.scalar(select(func.min(KitchenTicket.fired_at))
                           .where(KitchenTicket.location_id == location_id,
                                  KitchenTicket.status.in_((TicketStatus.NEW,
                                                            TicketStatus.ACCEPTED,
                                                            TicketStatus.PREPARING))))
        out.kitchen = KitchenCounts(
            new=ticket_counts.get(TicketStatus.NEW, 0) + ticket_counts.get(TicketStatus.ACCEPTED, 0),
            preparing=ticket_counts.get(TicketStatus.PREPARING, 0),
            ready=ticket_counts.get(TicketStatus.READY, 0), oldest_active_fired_at=oldest)

    if actor.can("orders.view"):
        out.open_orders = db.scalar(select(func.count()).where(
            Order.location_id == location_id, Order.status.in_(ACTIVE_ORDER_STATUSES))) or 0
        out.ready_items = int(db.scalar(
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.location_id == location_id, OrderItem.status == OrderItemStatus.READY)
        ) or 0)

    if actor.can("billing.view"):
        n, amount = db.execute(select(func.count(), func.coalesce(func.sum(Bill.total - Bill.paid_total), 0))
                               .where(Bill.location_id == location_id,
                                      Bill.status == BillStatus.OPEN)).one()
        out.open_bills, out.open_bills_amount = int(n), _dec(amount)

    if actor.can("reports.view"):
        lo, hi = day_bounds(today, today, _zone(actor))
        net, bills = _net_sales(db, location_id, lo, hi)
        out.sales_today = SalesToday(net_sales=net, paid_bills=bills,
                                     average_bill=q(net / bills) if bills else ZERO)

    if actor.can("audit_logs.view"):
        rows = db.execute(select(AuditLog, User.full_name)
                          .outerjoin(User, User.id == AuditLog.actor_id)
                          .where(AuditLog.location_id == location_id)
                          .order_by(AuditLog.id.desc()).limit(8)).all()
        out.recent_activity = [ActivityOut(id=a.id, action=a.action, summary=a.summary,
                                           actor_name=name, created_at=a.created_at)
                               for a, name in rows]
    return out


def report(db: Session, actor: Actor, start: date, end: date) -> ReportOut:
    if end < start:
        raise ValidationFailed("The end date is before the start date.")
    if (end - start).days >= MAX_REPORT_DAYS:
        raise ValidationFailed("Reports can cover at most one year.")
    if start < EARLIEST or end > LATEST:
        raise ValidationFailed("Choose dates between 2000 and 2100.")
    zone = _zone(actor)
    lo, hi = day_bounds(start, end, zone)
    loc = actor.location_id
    in_range = (Bill.location_id == loc, Bill.status.in_(PAID_STATES), Bill.paid_at >= lo,
                Bill.paid_at < hi)

    gross, bills, discounts, discounted, taxes, service = db.execute(
        select(func.coalesce(func.sum(Bill.total), 0), func.count(),
               func.coalesce(func.sum(Bill.discount_amount), 0),
               func.count().filter(Bill.discount_amount > 0),
               func.coalesce(func.sum(Bill.tax_total), 0),
               func.coalesce(func.sum(Bill.service_charge_amount), 0)).where(*in_range)
    ).one()
    refunds = db.scalar(_sales_refunds(loc, lo, hi))
    guests = db.scalar(select(func.coalesce(func.sum(Order.guest_count), 0))
                       .join(Bill, Bill.order_id == Order.id).where(*in_range)) or 0
    cancelled = db.scalar(select(func.count()).where(
        Order.location_id == loc, Order.status == OrderStatus.CANCELLED,
        Order.cancelled_at >= lo, Order.cancelled_at < hi)) or 0
    voided = db.scalar(select(func.coalesce(func.sum(OrderItem.unit_price * OrderItem.quantity), 0))
                       .join(Order, Order.id == OrderItem.order_id)
                       .where(Order.location_id == loc, OrderItem.status == OrderItemStatus.VOIDED,
                              OrderItem.voided_at >= lo, OrderItem.voided_at < hi))

    local_paid = func.timezone(actor.location.timezone, Bill.paid_at)
    daily_rows = db.execute(select(func.date(local_paid), func.sum(Bill.total), func.count())
                            .where(*in_range).group_by(func.date(local_paid))).all()
    daily_map = {d: (_dec(total), int(n)) for d, total, n in daily_rows}
    local_refund = func.timezone(actor.location.timezone, Payment.created_at)
    refund_rows = db.execute(
        select(func.date(local_refund), func.sum(Payment.amount))
        .join(Bill, Bill.id == Payment.bill_id)
        .where(Bill.location_id == loc, Payment.kind == PaymentKind.REFUND,
               Payment.is_correction.is_(False), Payment.created_at >= lo,
               Payment.created_at < hi)
        .group_by(func.date(local_refund))).all()
    refund_map = {d: _dec(total) for d, total in refund_rows}
    daily = []
    cursor = start
    while cursor <= end:
        gross_day, n = daily_map.get(cursor, (ZERO, 0))
        refund_day = refund_map.get(cursor, ZERO)
        daily.append(DailySales(date=cursor, gross_sales=gross_day, refunds=refund_day,
                                net_sales=gross_day - refund_day, orders=n))
        cursor += timedelta(days=1)
    hour = cast(extract("hour", local_paid), Integer)
    hourly_rows = {int(h): (_dec(t), int(n)) for h, t, n in db.execute(
        select(hour, func.sum(Bill.total), func.count()).where(*in_range).group_by(hour)).all()}
    hourly = [HourlySales(hour=h, sales=hourly_rows.get(h, (ZERO, 0))[0],
                          orders=hourly_rows.get(h, (ZERO, 0))[1]) for h in range(24)]

    top = db.execute(
        select(OrderItem.menu_item_id, OrderItem.name, func.sum(OrderItem.quantity),
               func.sum(OrderItem.unit_price * OrderItem.quantity))
        .join(Bill, Bill.order_id == OrderItem.order_id)
        .where(*in_range, OrderItem.status != OrderItemStatus.VOIDED)
        .group_by(OrderItem.menu_item_id, OrderItem.name)
        .order_by(func.sum(OrderItem.quantity).desc(), OrderItem.name).limit(10)
    ).all()
    # Money actually collected per method: payments in minus refunds out.
    signed = case((Payment.kind == PaymentKind.REFUND, -Payment.amount), else_=Payment.amount)
    methods = db.execute(
        select(Payment.method_name, func.count().filter(Payment.kind == PaymentKind.PAYMENT),
               func.sum(signed))
        .join(Bill, Bill.id == Payment.bill_id)
        .where(Bill.location_id == loc, Payment.created_at >= lo, Payment.created_at < hi)
        .group_by(Payment.method_name).order_by(func.sum(signed).desc())
    ).all()
    minutes = extract("epoch", Order.closed_at - Order.opened_at) / 60
    tables = db.execute(
        select(DiningTable.name, func.count(), func.sum(Bill.total), func.avg(minutes))
        .join(Order, Order.id == Bill.order_id).join(DiningTable, DiningTable.id == Order.table_id)
        .where(*in_range).group_by(DiningTable.name).order_by(func.sum(Bill.total).desc())
    ).all()
    staff = db.execute(
        select(User.full_name, func.count(), func.sum(Bill.total))
        .join(Order, Order.id == Bill.order_id).join(User, User.id == Order.server_id)
        .where(*in_range).group_by(User.full_name).order_by(func.sum(Bill.total).desc())
    ).all()

    gross_d, refunds_d = _dec(gross), _dec(refunds)
    return ReportOut(
        start_date=start, end_date=end, currency_code=actor.location.currency_code,
        gross_sales=gross_d, refunds=refunds_d, net_sales=gross_d - refunds_d,
        order_count=int(bills), average_order_value=q(gross_d / bills) if bills else ZERO,
        guests=int(guests), discounts_total=_dec(discounts), discounted_bills=int(discounted),
        tax_total=_dec(taxes), service_charge_total=_dec(service), cancelled_orders=int(cancelled),
        voided_items_value=_dec(voided), daily=daily, hourly=hourly,
        top_items=[TopItem(menu_item_id=i, name=n, quantity=int(qty), revenue=_dec(rev))
                   for i, n, qty, rev in top],
        payment_methods=[NamedAmount(name=n, count=int(c), amount=_dec(a)) for n, c, a in methods],
        tables=[TableUsage(table_name=n, orders=int(c), revenue=_dec(r),
                           average_minutes=round(float(m or 0))) for n, c, r, m in tables],
        staff=[NamedAmount(name=n, count=int(c), amount=_dec(a)) for n, c, a in staff],
    )


def audit_logs(db: Session, actor: Actor, *, before_id: int | None, entity_type: str | None,
               action_prefix: str | None, actor_id: int | None, limit: int,
               since: datetime | None = None, until: datetime | None = None) -> AuditPage:
    stmt = (select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.restaurant_id == actor.restaurant_id,
                   (AuditLog.location_id == actor.location_id) | AuditLog.location_id.is_(None)))
    if before_id is not None:
        stmt = stmt.where(AuditLog.id < before_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action_prefix:
        stmt = stmt.where(AuditLog.action.startswith(action_prefix, autoescape=True))
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if since is not None:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until is not None:
        stmt = stmt.where(AuditLog.created_at < until)
    rows = db.execute(stmt.order_by(AuditLog.id.desc()).limit(limit + 1)).all()
    items = [AuditLogOut(id=a.id, action=a.action, entity_type=a.entity_type,
                         entity_id=a.entity_id, summary=a.summary, actor_id=a.actor_id,
                         actor_name=name, metadata=a.meta or {}, created_at=a.created_at)
             for a, name in rows[:limit]]
    return AuditPage(items=items,
                     next_before_id=items[-1].id if len(rows) > limit and items else None)


