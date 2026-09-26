from datetime import datetime
from typing import Literal

from app.schemas.common import InputModel, OutputModel, Version


class TicketItemOut(OutputModel):
    id: int
    name: str
    quantity: int
    notes: str | None
    status: str


class TicketOut(OutputModel):
    id: int
    ticket_number: int
    status: str
    order_id: int
    order_number: int
    order_status: str
    order_notes: str | None
    table_name: str
    server_name: str
    fired_at: datetime
    accepted_at: datetime | None
    started_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    items: list[TicketItemOut]
    version: int


class KitchenBoardOut(OutputModel):
    tickets: list[TicketOut]
    server_time: datetime


class TicketTransitionIn(InputModel):
    version: Version
    to: Literal["ACCEPTED", "PREPARING", "READY", "COMPLETED"]
