"""Bills and payments. Every amount here is computed server-side from order lines + settings."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import Actor
from app.core.errors import InvalidTransition, NotFound, ValidationFailed
from app.models import Bill, BillTax, DiningTable, Location, Order, Payment, PaymentMethod, User
from app.models.enums import (
    BillStatus,
    DiscountType,
    OrderItemStatus,
    OrderStatus,
    PaymentKind,
)
from app.schemas.billing import (
    BillOut,
    BillSummary,
    DiscountIn,
    PaymentIn,
    PaymentOut,
    RefundIn,
    VoidBillIn,
)
from app.schemas.orders import TaxLineOut
from app.services import audit, floor, money
from app.services import orders as order_service
from app.services.common import bump, check_version, now, pairs
from app.services.settings import active_tax_rates

ZERO = Decimal("0.00")


def get_bill(db: Session, actor: Actor, bill_id: int, *, lock: bool = False) -> Bill:
    stmt = select(Bill).where(Bill.id == bill_id, Bill.location_id == actor.location_id)
    if lock:
        stmt = stmt.with_for_update(of=Bill).execution_options(populate_existing=True)
    bill = db.scalar(stmt)
    if bill is None:
        raise NotFound("Bill not found.")
    return bill


def _names(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return pairs(db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids))))


def to_out(db: Session, bill: Bill) -> BillOut:
    db.flush()
    db.refresh(bill, attribute_names=["payments", "taxes"])
    order = bill.order
    names = _names(db, {bill.created_by_id, *(p.created_by_id for p in bill.payments)})
    return BillOut(
        id=bill.id, bill_number=bill.bill_number, status=bill.status, order_id=order.id,
        order_number=order.order_number, table_name=order.table.name,
        server_name=order.server.full_name, guest_count=order.guest_count,
        currency_code=bill.currency_code, subtotal=bill.subtotal,
        discount_type=bill.discount_type, discount_value=bill.discount_value,
        discount_amount=bill.discount_amount, discount_reason=bill.discount_reason,
        service_charge_percent=bill.service_charge_percent,
        service_charge_amount=bill.service_charge_amount,
        taxes=[TaxLineOut.model_validate(t) for t in bill.taxes], tax_total=bill.tax_total,
        round_off=bill.round_off, total=bill.total, paid_total=bill.paid_total,
        refunded_total=bill.refunded_total, balance_due=bill.balance_due,
        payments=[PaymentOut(
            id=p.id, kind=p.kind, payment_method_id=p.payment_method_id,
            method_name=p.method_name, amount=p.amount, tendered=p.tendered,
            change_due=p.change_due, reference=p.reference, reason=p.reason,
            created_by_name=names.get(p.created_by_id, ""), created_at=p.created_at,
        ) for p in bill.payments],
        created_by_name=names.get(bill.created_by_id, ""), created_at=bill.created_at,
        paid_at=bill.paid_at, voided_at=bill.voided_at, void_reason=bill.void_reason,
        version=bill.version,
    )


def list_bills(db: Session, actor: Actor, *, statuses: list[BillStatus] | None,
               since: datetime | None, limit: int, offset: int) -> tuple[list[BillSummary], int]:
    stmt = (select(Bill, Order.order_number, DiningTable.name)
            .join(Order, Order.id == Bill.order_id)
            .join(DiningTable, DiningTable.id == Order.table_id)
            .where(Bill.location_id == actor.location_id))
    if statuses:
        stmt = stmt.where(Bill.status.in_(statuses))
    if since is not None:
        stmt = stmt.where(Bill.created_at >= since)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.options(joinedload(Bill.order).noload("*"))
                      .order_by(Bill.created_at.desc(), Bill.id.desc())
                      .limit(limit).offset(offset)).all()
    return [BillSummary(
        id=b.id, bill_number=b.bill_number, status=b.status, order_id=b.order_id,
        order_number=number, table_name=table_name, total=b.total, paid_total=b.paid_total,
        balance_due=b.balance_due, created_at=b.created_at, paid_at=b.paid_at,
        version=b.version,
    ) for b, number, table_name in rows], total


def _recompute(bill: Bill, order: Order, rounding_increment: Decimal,
               taxes: list[tuple[str, Decimal]]) -> None:
    """Recalculate a bill from its order's live lines and the bill's own rate snapshot."""
    breakdown = money.compute(
        [i.line_total for i in order_service.live_items(order)],
        discount_type=bill.discount_type, discount_value=bill.discount_value,
        service_charge_percent=bill.service_charge_percent,
        service_charge_taxable=bill.service_charge_taxable,
        taxes=taxes, rounding_increment=rounding_increment,
    )
    bill.subtotal = breakdown.subtotal
    bill.discount_amount = breakdown.discount_amount
    bill.service_charge_amount = breakdown.service_charge_amount
    bill.tax_total = breakdown.tax_total
    bill.round_off = breakdown.round_off
    bill.total = breakdown.total
    bill.taxes = [BillTax(name=t.name, rate_percent=t.rate_percent,
                          taxable_amount=t.taxable_amount, amount=t.amount)
                  for t in breakdown.taxes]


def create_bill(db: Session, actor: Actor, order_id: int, order_version: int) -> Bill:
    order = order_service.get_order(db, actor, order_id, lock=True)
    if order.status == OrderStatus.BILLED:
        existing = order_service.live_bill(db, order.id)
        if existing is not None:
            raise InvalidTransition("This order already has a bill.",
                                    details={"bill_id": existing.id})
    order_service._require_status(order, OrderStatus.OPEN, action="issue a bill")
    check_version(order, order_version, "order")
    if any(i.status == OrderItemStatus.PENDING for i in order.items):
        raise InvalidTransition("Some items haven't been sent to the kitchen. "
                                "Send or remove them first.")
    if not order_service.live_items(order):
        raise InvalidTransition("There's nothing to bill. Cancel the order instead.")
    location = db.scalar(select(Location).where(Location.id == actor.location_id)
                         .with_for_update().execution_options(populate_existing=True))
    assert location is not None
    number = f"{location.bill_prefix}-{location.next_bill_number:06d}"
    location.next_bill_number += 1
    bill = Bill(location_id=location.id, order_id=order.id, bill_number=number,
                status=BillStatus.OPEN, currency_code=location.currency_code,
                service_charge_percent=location.service_charge_percent,
                service_charge_taxable=location.service_charge_taxable,
                rounding_increment=location.rounding_increment, discount_amount=ZERO,
                paid_total=ZERO, refunded_total=ZERO,
                created_by_id=actor.id, taxes=[])
    _recompute(bill, order, location.rounding_increment,
               [(t.name, t.rate_percent) for t in active_tax_rates(db, location.id)])
    db.add(bill)
    order.status = OrderStatus.BILLED
    order.billed_at = now()
    bump(order)
    db.flush()
    audit.record(db, actor, "bill.created", "bill", bill.id,
                 f"Issued bill {number} for #{order.order_number} ({bill.total})",
                 total=bill.total, order_id=order.id)
    return bill


def _lock_bill_and_order(db: Session, actor: Actor, bill_id: int) -> tuple[Bill, Order]:
    """Order first, then bill: the same lock order as every order-level operation."""
    order_id = get_bill(db, actor, bill_id).order_id
    order = order_service.get_order(db, actor, order_id, lock=True)
    return get_bill(db, actor, bill_id, lock=True), order


def apply_discount(db: Session, actor: Actor, bill_id: int, data: DiscountIn) -> Bill:
    bill, order = _lock_bill_and_order(db, actor, bill_id)
    check_version(bill, data.version, "bill")
    if bill.status != BillStatus.OPEN:
        raise InvalidTransition("Only an unpaid bill can be discounted.")
    if bill.paid_total > ZERO:
        raise InvalidTransition("Payments have been taken on this bill. "
                                "Discounts must be applied before payment.")
    if data.type == DiscountType.FIXED and data.value is not None and data.value > bill.subtotal:
        raise ValidationFailed("The discount is larger than the bill.")
    before = bill.total
    bill.discount_type = data.type
    bill.discount_value = data.value
    bill.discount_reason = data.reason if data.type else None
    _recompute(bill, order, bill.rounding_increment,
               [(t.name, t.rate_percent) for t in bill.taxes])
    bump(bill)
    bump(order)
    audit.record(db, actor, "bill.discount_applied" if data.type else "bill.discount_removed",
                 "bill", bill.id,
                 f"{'Discount on' if data.type else 'Removed discount from'} {bill.bill_number}: "
                 f"{before} → {bill.total}",
                 type=data.type, value=data.value, amount=bill.discount_amount,
                 reason=data.reason)
    return bill


def void_bill(db: Session, actor: Actor, bill_id: int, data: VoidBillIn) -> Bill:
    bill, order = _lock_bill_and_order(db, actor, bill_id)
    check_version(bill, data.version, "bill")
    if bill.status != BillStatus.OPEN:
        raise InvalidTransition("Only an unpaid bill can be voided. Use a refund instead.")
    if bill.paid_total > ZERO:
        raise InvalidTransition("Payments have been taken on this bill. Refund them first.")
    bill.status = BillStatus.VOID
    bill.voided_at = now()
    bill.void_reason = data.reason
    bump(bill)
    order.status = OrderStatus.OPEN
    order.billed_at = None
    bump(order)
    audit.record(db, actor, "bill.voided", "bill", bill.id,
                 f"Voided bill {bill.bill_number} ({bill.total})", reason=data.reason)
    return bill


def _method(db: Session, actor: Actor, method_id: int) -> PaymentMethod:
    method = db.scalar(select(PaymentMethod).where(PaymentMethod.id == method_id,
                                                   PaymentMethod.location_id == actor.location_id,
                                                   PaymentMethod.is_active))
    if method is None:
        raise ValidationFailed("That payment method isn't available.")
    return method


def _settle(db: Session, actor: Actor, bill: Bill, order: Order) -> None:
    """Bill fully paid: close the order and free the table, in the same transaction."""
    bill.status = BillStatus.PAID
    bill.paid_at = now()
    order.status = OrderStatus.CLOSED
    order.closed_at = bill.paid_at
    bump(order)
    table = floor.get_table(db, actor, order.table_id, lock=True)
    floor.release(table, used=True, after_payment_status=actor.location.status_after_payment)


def pay(db: Session, actor: Actor, bill_id: int, data: PaymentIn) -> Bill:
    bill, order = _lock_bill_and_order(db, actor, bill_id)
    check_version(bill, data.version, "bill")
    if bill.status != BillStatus.OPEN:
        raise InvalidTransition("This bill isn't awaiting payment.",
                                details={"status": bill.status})
    method = _method(db, actor, data.payment_method_id)
    due = bill.balance_due
    if data.amount > due:
        raise ValidationFailed(f"That's more than the {due} still due.",
                               details={"balance_due": str(due)})
    tendered: Decimal | None = None
    change = ZERO
    if data.tendered is not None:
        if not method.is_cash:
            raise ValidationFailed("Cash tendered only applies to cash payments.")
        if data.tendered < data.amount:
            raise ValidationFailed("Cash tendered is less than the amount.")
        tendered = data.tendered
        change = data.tendered - data.amount
    payment = Payment(bill_id=bill.id, kind=PaymentKind.PAYMENT, payment_method_id=method.id,
                      method_name=method.name, amount=data.amount, tendered=tendered,
                      change_due=change, reference=data.reference or None,
                      created_by_id=actor.id)
    db.add(payment)
    bill.paid_total += data.amount
    if bill.paid_total >= bill.total:
        _settle(db, actor, bill, order)
    bump(bill)
    db.flush()
    audit.record(db, actor, "payment.processed", "bill", bill.id,
                 f"{method.name} {data.amount} on {bill.bill_number}",
                 payment_id=payment.id, amount=data.amount, method=method.name,
                 settled=bill.status == BillStatus.PAID)
    return bill


def settle_zero(db: Session, actor: Actor, bill_id: int, version: int) -> Bill:
    """Close a bill whose total is zero (fully comped): there is nothing to collect."""
    bill, order = _lock_bill_and_order(db, actor, bill_id)
    check_version(bill, version, "bill")
    if bill.status != BillStatus.OPEN or bill.total != ZERO:
        raise InvalidTransition("Only an open bill with nothing due can be closed this way.")
    _settle(db, actor, bill, order)
    bump(bill)
    audit.record(db, actor, "bill.settled_zero", "bill", bill.id,
                 f"Closed zero-total bill {bill.bill_number}")
    return bill


def refund(db: Session, actor: Actor, bill_id: int, data: RefundIn) -> Bill:
    bill, _ = _lock_bill_and_order(db, actor, bill_id)
    check_version(bill, data.version, "bill")
    if bill.status not in (BillStatus.PAID, BillStatus.PARTIALLY_REFUNDED):
        raise InvalidTransition("Only a paid bill can be refunded.")
    refundable = bill.paid_total - bill.refunded_total
    if data.amount > refundable:
        raise ValidationFailed(f"At most {refundable} can be refunded.",
                               details={"refundable": str(refundable)})
    method = _method(db, actor, data.payment_method_id)
    db.add(Payment(bill_id=bill.id, kind=PaymentKind.REFUND, payment_method_id=method.id,
                   method_name=method.name, amount=data.amount, change_due=ZERO,
                   reason=data.reason, created_by_id=actor.id))
    bill.refunded_total += data.amount
    bill.status = (BillStatus.REFUNDED if bill.refunded_total >= bill.paid_total
                   else BillStatus.PARTIALLY_REFUNDED)
    bump(bill)
    audit.record(db, actor, "payment.refunded", "bill", bill.id,
                 f"Refunded {data.amount} ({method.name}) on {bill.bill_number}",
                 amount=data.amount, method=method.name, reason=data.reason)
    return bill
