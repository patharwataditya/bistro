from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from app.schemas.common import InputModel, OutputModel, PositiveMoneyIn, Reason, Version
from app.schemas.orders import TaxLineOut


class BillCreate(InputModel):
    order_id: int
    order_version: Version


class DiscountIn(InputModel):
    version: Version
    type: Literal["PERCENT", "FIXED"] | None
    value: Annotated[Decimal | None, Field(gt=0, le=Decimal("9999999999.99"),
                                           decimal_places=2)] = None
    reason: Reason | None = None

    @model_validator(mode="after")
    def _consistent(self) -> "DiscountIn":
        if self.type is None:
            if self.value is not None:
                raise ValueError("Omit value when removing a discount")
        else:
            if self.value is None:
                raise ValueError("A discount needs a value")
            if self.reason is None:
                raise ValueError("A discount needs a reason")
            if self.type == "PERCENT" and self.value > 100:
                raise ValueError("A percentage discount can't exceed 100")
        return self


class VoidBillIn(InputModel):
    version: Version
    reason: Reason


class PaymentIn(InputModel):
    version: Version
    payment_method_id: int
    amount: PositiveMoneyIn
    tendered: PositiveMoneyIn | None = None
    reference: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=80)] = None


class RefundIn(InputModel):
    version: Version
    payment_method_id: int
    amount: PositiveMoneyIn
    reason: Reason


class PaymentOut(OutputModel):
    id: int
    kind: str
    payment_method_id: int
    method_name: str
    amount: Decimal
    tendered: Decimal | None
    change_due: Decimal
    reference: str | None
    reason: str | None
    created_by_name: str
    created_at: datetime


class BillOut(OutputModel):
    id: int
    bill_number: str
    status: str
    order_id: int
    order_number: int
    table_name: str
    server_name: str
    guest_count: int
    currency_code: str
    subtotal: Decimal
    discount_type: str | None
    discount_value: Decimal | None
    discount_amount: Decimal
    discount_reason: str | None
    service_charge_percent: Decimal
    service_charge_amount: Decimal
    taxes: list[TaxLineOut]
    tax_total: Decimal
    round_off: Decimal
    total: Decimal
    paid_total: Decimal
    refunded_total: Decimal
    balance_due: Decimal
    payments: list[PaymentOut]
    created_by_name: str
    created_at: datetime
    paid_at: datetime | None
    voided_at: datetime | None
    void_reason: str | None
    version: int


class BillSummary(OutputModel):
    id: int
    bill_number: str
    status: str
    order_id: int
    order_number: int
    table_name: str
    total: Decimal
    paid_total: Decimal
    balance_due: Decimal
    created_at: datetime
    paid_at: datetime | None
    version: int
