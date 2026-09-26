from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import JSONResponse

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.models.enums import BillStatus
from app.schemas.billing import (
    BillCreate,
    BillOut,
    BillSummary,
    DiscountIn,
    PaymentIn,
    RefundIn,
    VoidBillIn,
)
from app.schemas.common import Page, VersionIn
from app.services import billing
from app.services.idempotency import run_idempotent

router = APIRouter(route_class=TransactionalRoute, prefix="/bills", tags=["billing"])
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.get("", response_model=Page[BillSummary])
def list_bills(
    db: DB,
    actor: Annotated[Actor, Depends(require("billing.view"))],
    status_: Annotated[list[BillStatus] | None, Query(alias="status")] = None,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[BillSummary]:
    items, total = billing.list_bills(db, actor, statuses=status_, since=since, limit=limit,
                                      offset=offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(body: BillCreate, db: DB,
                actor: Annotated[Actor, Depends(require("billing.create"))],
                idempotency_key: IdempotencyKey = None) -> JSONResponse:
    """Issue the bill for an OPEN order with no unsent items. Totals are computed here."""
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route="bills.create",
        request_payload=body.model_dump(mode="json"), status_code=201,
        handler=lambda: billing.to_out(
            db, billing.create_bill(db, actor, body.order_id, body.order_version)),
    )


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(bill_id: int, db: DB,
             actor: Annotated[Actor, Depends(require("billing.view"))]) -> BillOut:
    return billing.to_out(db, billing.get_bill(db, actor, bill_id))


@router.post("/{bill_id}/discount", response_model=BillOut)
def discount(bill_id: int, body: DiscountIn, db: DB,
             actor: Annotated[Actor, Depends(require("billing.discount"))]) -> BillOut:
    """Set (`type` + `value` + `reason`) or clear (`type: null`) the bill discount."""
    return billing.to_out(db, billing.apply_discount(db, actor, bill_id, body))


@router.post("/{bill_id}/void", response_model=BillOut)
def void(bill_id: int, body: VoidBillIn, db: DB,
         actor: Annotated[Actor, Depends(require("billing.void"))]) -> BillOut:
    """Void an unpaid bill; the order returns to OPEN for changes."""
    return billing.to_out(db, billing.void_bill(db, actor, bill_id, body))


@router.post("/{bill_id}/payments", response_model=BillOut)
def pay(bill_id: int, body: PaymentIn, db: DB,
        actor: Annotated[Actor, Depends(require("billing.process_payment"))],
        idempotency_key: IdempotencyKey = None) -> JSONResponse:
    """Record a payment. When the bill is covered it becomes PAID, the order CLOSED and the
    table is released — atomically. Always send an `Idempotency-Key`."""
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route=f"bills.{bill_id}.pay",
        request_payload=body.model_dump(mode="json"), status_code=200,
        handler=lambda: billing.to_out(db, billing.pay(db, actor, bill_id, body)),
    )


@router.post("/{bill_id}/settle", response_model=BillOut)
def settle_zero(bill_id: int, body: VersionIn, db: DB,
                actor: Annotated[Actor, Depends(require("billing.process_payment"))]) -> BillOut:
    """Close a bill whose total is zero."""
    return billing.to_out(db, billing.settle_zero(db, actor, bill_id, body.version))


@router.post("/{bill_id}/refunds", response_model=BillOut)
def refund(bill_id: int, body: RefundIn, db: DB,
           actor: Annotated[Actor, Depends(require("billing.refund"))],
           idempotency_key: IdempotencyKey = None) -> JSONResponse:
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route=f"bills.{bill_id}.refund",
        request_payload=body.model_dump(mode="json"), status_code=200,
        handler=lambda: billing.to_out(db, billing.refund(db, actor, bill_id, body)),
    )
