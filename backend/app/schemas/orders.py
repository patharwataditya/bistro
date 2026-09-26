from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.common import InputModel, OutputModel, Reason, ShortText, Version

Quantity = Annotated[int, Field(ge=1, le=999)]
ItemNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
GuestCount = Annotated[int, Field(ge=1, le=100)]


class OrderItemIn(InputModel):
    menu_item_id: int
    quantity: Quantity = 1
    notes: ItemNote | None = None


class OrderCreate(InputModel):
    table_id: int
    guest_count: GuestCount = 1
    notes: ShortText | None = None
    items: Annotated[list[OrderItemIn], Field(max_length=100)] = []


class AddItemsIn(InputModel):
    items: Annotated[list[OrderItemIn], Field(min_length=1, max_length=100)]


class ItemUpdate(InputModel):
    quantity: Quantity | None = None
    notes: ItemNote | None = None


class VoidItemIn(InputModel):
    reason: Reason


class OrderUpdate(InputModel):
    version: Version
    guest_count: GuestCount | None = None
    notes: ShortText | None = None


class FireIn(InputModel):
    version: Version


class CancelOrderIn(InputModel):
    version: Version
    reason: Reason


class TransferIn(InputModel):
    version: Version
    table_id: int


class MergeIn(InputModel):
    version: Version
    source_order_id: int
    source_version: Version


class SplitIn(InputModel):
    version: Version
    table_id: int
    item_ids: Annotated[list[int], Field(min_length=1, max_length=200)]
    guest_count: GuestCount = 1


class OrderItemOut(OutputModel):
    id: int
    menu_item_id: int
    name: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal
    notes: str | None
    status: str
    ticket_id: int | None
    void_reason: str | None
    created_at: datetime


class TaxLineOut(OutputModel):
    name: str
    rate_percent: Decimal
    taxable_amount: Decimal
    amount: Decimal


class TotalsOut(OutputModel):
    subtotal: Decimal
    discount_amount: Decimal
    service_charge_percent: Decimal
    service_charge_amount: Decimal
    taxes: list[TaxLineOut]
    tax_total: Decimal
    round_off: Decimal
    total: Decimal


class OrderOut(OutputModel):
    id: int
    order_number: int
    status: str
    table_id: int
    table_name: str
    server_id: int
    server_name: str
    guest_count: int
    notes: str | None
    opened_at: datetime
    billed_at: datetime | None
    closed_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    merged_into_id: int | None
    items: list[OrderItemOut]
    totals: TotalsOut
    bill_id: int | None
    currency_code: str
    version: int


class OrderSummary(OutputModel):
    id: int
    order_number: int
    status: str
    table_id: int
    table_name: str
    server_name: str
    guest_count: int
    opened_at: datetime
    closed_at: datetime | None
    item_count: int
    subtotal: Decimal
    version: int
