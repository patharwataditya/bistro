from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import JSONResponse

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.models.enums import OrderStatus
from app.schemas.common import Page
from app.schemas.orders import (
    AddItemsIn,
    CancelOrderIn,
    FireIn,
    ItemUpdate,
    MergeIn,
    OrderCreate,
    OrderOut,
    OrderSummary,
    OrderUpdate,
    SplitIn,
    TransferIn,
    VoidItemIn,
)
from app.services import orders
from app.services.idempotency import run_idempotent

router = APIRouter(route_class=TransactionalRoute, prefix="/orders", tags=["orders"])
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.get("", response_model=Page[OrderSummary])
def list_orders(
    db: DB,
    actor: Annotated[Actor, Depends(require("orders.view"))],
    status_: Annotated[list[OrderStatus] | None, Query(alias="status")] = None,
    table_id: int | None = None,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[OrderSummary]:
    items, total = orders.list_orders(db, actor, statuses=status_, table_id=table_id,
                                      since=since, limit=limit, offset=offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def open_order(body: OrderCreate, db: DB,
               actor: Annotated[Actor, Depends(require("orders.create"))],
               idempotency_key: IdempotencyKey = None) -> JSONResponse:
    """Seat a table: creates the order, marks the table OCCUPIED, optionally adds items.
    Send an `Idempotency-Key` so a retried request never opens a second order."""
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route="orders.open",
        request_payload=body.model_dump(mode="json"), status_code=201,
        handler=lambda: orders.to_out(db, actor, orders.open_order(db, actor, body)),
    )


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: DB,
              actor: Annotated[Actor, Depends(require("orders.view"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.get_order(db, actor, order_id))


@router.patch("/{order_id}", response_model=OrderOut)
def update_order(order_id: int, body: OrderUpdate, db: DB,
                 actor: Annotated[Actor, Depends(require("orders.update"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.update_order(db, actor, order_id, body))


@router.post("/{order_id}/items", response_model=OrderOut)
def add_items(order_id: int, body: AddItemsIn, db: DB,
              actor: Annotated[Actor, Depends(require("orders.update"))],
              idempotency_key: IdempotencyKey = None) -> JSONResponse:
    """Add lines as PENDING. Identical pending lines (same item and note) are combined."""
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route=f"orders.{order_id}.items",
        request_payload=body.model_dump(mode="json"), status_code=200,
        handler=lambda: orders.to_out(db, actor, orders.add_items(db, actor, order_id, body)),
    )


@router.patch("/{order_id}/items/{item_id}", response_model=OrderOut)
def update_item(order_id: int, item_id: int, body: ItemUpdate, db: DB,
                actor: Annotated[Actor, Depends(require("orders.update"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.update_item(db, actor, order_id, item_id, body))


@router.delete("/{order_id}/items/{item_id}", response_model=OrderOut)
def remove_item(order_id: int, item_id: int, db: DB,
                actor: Annotated[Actor, Depends(require("orders.update"))]) -> OrderOut:
    """Remove a PENDING (unsent) line. Sent lines must be voided."""
    return orders.to_out(db, actor, orders.remove_pending_item(db, actor, order_id, item_id))


@router.post("/{order_id}/items/{item_id}/void", response_model=OrderOut)
def void_item(order_id: int, item_id: int, body: VoidItemIn, db: DB,
              actor: Annotated[Actor, Depends(require("orders.cancel"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.void_item(db, actor, order_id, item_id, body.reason))


@router.post("/{order_id}/items/{item_id}/serve", response_model=OrderOut)
def serve_item(order_id: int, item_id: int, db: DB,
               actor: Annotated[Actor, Depends(require("orders.update"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.mark_served(db, actor, order_id, item_id))


@router.post("/{order_id}/fire", response_model=OrderOut)
def fire(order_id: int, body: FireIn, db: DB,
         actor: Annotated[Actor, Depends(require("orders.update"))],
         idempotency_key: IdempotencyKey = None) -> JSONResponse:
    """Send all PENDING lines to the kitchen as one ticket."""
    return run_idempotent(
        db, user_id=actor.id, key=idempotency_key, route=f"orders.{order_id}.fire",
        request_payload=body.model_dump(mode="json"), status_code=200,
        handler=lambda: orders.to_out(db, actor, orders.fire(db, actor, order_id, body.version)),
    )


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel(order_id: int, body: CancelOrderIn, db: DB,
           actor: Annotated[Actor, Depends(require("orders.update"))]) -> OrderOut:
    """Cancel an OPEN order. If anything was already sent, `orders.cancel` is also required."""
    return orders.to_out(db, actor, orders.cancel(db, actor, order_id, body))


@router.post("/{order_id}/transfer", response_model=OrderOut)
def transfer(order_id: int, body: TransferIn, db: DB,
             actor: Annotated[Actor, Depends(require("orders.transfer"))]) -> OrderOut:
    return orders.to_out(db, actor, orders.transfer(db, actor, order_id, body))


@router.post("/{order_id}/merge", response_model=OrderOut)
def merge(order_id: int, body: MergeIn, db: DB,
          actor: Annotated[Actor, Depends(require("orders.transfer"))]) -> OrderOut:
    """Merge `source_order_id` into this order. The source's table is released."""
    return orders.to_out(db, actor, orders.merge(db, actor, order_id, body))


@router.post("/{order_id}/split", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def split(order_id: int, body: SplitIn, db: DB,
          actor: Annotated[Actor, Depends(require("orders.transfer"))]) -> OrderOut:
    """Move items to a new order on another free table. Returns the new order."""
    return orders.to_out(db, actor, orders.split(db, actor, order_id, body))
