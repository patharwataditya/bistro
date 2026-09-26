from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.common import InputModel, Name, OutputModel, ShortText, Version

TableName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
Capacity = Annotated[int, Field(ge=1, le=50)]
SortOrder = Annotated[int, Field(ge=0, le=10_000)]


class AreaOut(OutputModel):
    id: int
    name: str
    sort_order: int


class AreaIn(InputModel):
    name: Name
    sort_order: SortOrder = 0


class AreaUpdate(InputModel):
    name: Name | None = None
    sort_order: SortOrder | None = None


class ActiveOrderBrief(OutputModel):
    id: int
    order_number: int
    status: str
    guest_count: int
    opened_at: datetime
    server_name: str
    item_count: int
    pending_count: int
    ready_count: int
    subtotal: Decimal
    bill_id: int | None
    version: int


class TableOut(OutputModel):
    id: int
    name: str
    capacity: int
    area_id: int | None
    area_name: str | None
    status: str
    status_note: str | None
    sort_order: int
    version: int
    active_order: ActiveOrderBrief | None


class FloorOut(OutputModel):
    areas: list[AreaOut]
    tables: list[TableOut]
    server_time: datetime


class TableIn(InputModel):
    name: TableName
    capacity: Capacity
    area_id: int | None = None
    sort_order: SortOrder = 0


class TableUpdate(InputModel):
    version: Version
    name: TableName | None = None
    capacity: Capacity | None = None
    area_id: int | None = None
    clear_area: bool = False
    sort_order: SortOrder | None = None


class TableStatusIn(InputModel):
    version: Version
    status: Literal["AVAILABLE", "RESERVED", "CLEANING", "BLOCKED"]
    note: ShortText | None = None
