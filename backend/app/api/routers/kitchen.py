from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.models.enums import TicketStatus
from app.schemas.kitchen import KitchenBoardOut, TicketOut, TicketTransitionIn
from app.services import kitchen

router = APIRouter(route_class=TransactionalRoute, prefix="/kitchen", tags=["kitchen"])


@router.get("/tickets", response_model=KitchenBoardOut)
def board(db: DB, actor: Annotated[Actor, Depends(require("kitchen.view"))],
          include_recent: bool = True) -> KitchenBoardOut:
    """Active tickets oldest first, plus tickets completed in the last 30 minutes."""
    return kitchen.board(db, actor, include_recent=include_recent)


@router.post("/tickets/{ticket_id}/transition", response_model=TicketOut)
def transition(ticket_id: int, body: TicketTransitionIn, db: DB,
               actor: Annotated[Actor, Depends(require("kitchen.update"))]) -> TicketOut:
    """NEW→ACCEPTED|PREPARING, ACCEPTED→PREPARING, PREPARING→READY, READY→COMPLETED|PREPARING.
    Repeating the current state is a no-op (safe double-tap)."""
    ticket = kitchen.transition(db, actor, ticket_id, TicketStatus(body.to), body.version)
    db.flush()
    return kitchen.to_out(ticket)
