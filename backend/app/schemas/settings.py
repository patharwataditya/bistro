from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import available_timezones

from pydantic import Field, StringConstraints, field_validator

from app.schemas.common import InputModel, Name, OutputModel, Version

Percent = Annotated[Decimal, Field(ge=0, le=100, decimal_places=3)]
_TIMEZONES = frozenset(available_timezones())


class TaxRateOut(OutputModel):
    id: int
    name: str
    rate_percent: Decimal
    is_active: bool
    sort_order: int


class TaxRateIn(InputModel):
    id: int | None = None
    name: Name
    rate_percent: Percent
    is_active: bool = True


class PaymentMethodOut(OutputModel):
    id: int
    name: str
    is_cash: bool
    is_active: bool
    sort_order: int


class PaymentMethodIn(InputModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    is_cash: bool = False
    is_active: bool = True
    sort_order: Annotated[int, Field(ge=0, le=1000)] = 0


class PaymentMethodUpdate(InputModel):
    name: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1,
                                                  max_length=40)] = None
    is_cash: bool | None = None
    is_active: bool | None = None
    sort_order: Annotated[int | None, Field(ge=0, le=1000)] = None


class SettingsOut(OutputModel):
    restaurant_name: str
    location_name: str
    address: str | None
    timezone: str
    currency_code: str
    service_charge_percent: Decimal
    service_charge_taxable: bool
    rounding_increment: Decimal
    bill_prefix: str
    status_after_payment: str
    version: int
    tax_rates: list[TaxRateOut]
    payment_methods: list[PaymentMethodOut]


class SettingsUpdate(InputModel):
    version: Version
    restaurant_name: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1,
                                                             max_length=120)] = None
    location_name: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1,
                                                           max_length=120)] = None
    address: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=300)] = None
    timezone: str | None = None
    currency_code: Annotated[str | None, StringConstraints(pattern=r"^[A-Z]{3}$")] = None
    service_charge_percent: Annotated[Decimal | None, Field(ge=0, le=100, decimal_places=2)] = None
    service_charge_taxable: bool | None = None
    rounding_increment: Literal["0.01", "0.05", "0.10", "0.25", "0.50", "1.00"] | None = None
    bill_prefix: Annotated[str | None, StringConstraints(pattern=r"^[A-Z0-9-]{1,12}$")] = None
    status_after_payment: Literal["AVAILABLE", "CLEANING"] | None = None

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, value: str | None) -> str | None:
        if value is not None and value not in _TIMEZONES:
            raise ValueError("Unknown time zone")
        return value


class TaxRatesIn(InputModel):
    version: Version
    tax_rates: Annotated[list[TaxRateIn], Field(max_length=10)]
