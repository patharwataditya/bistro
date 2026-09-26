from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
def _cents(value: Decimal) -> Decimal:
    # "10" and "10.00" are the same amount: normalise so idempotency hashes and storage agree.
    return value.quantize(Decimal("0.01"))


MAX_MONEY = Decimal("9999999999.99")
MoneyIn = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2), AfterValidator(_cents)]
PositiveMoneyIn = Annotated[Decimal, Field(gt=0, le=MAX_MONEY, decimal_places=2),
                            AfterValidator(_cents)]
Id = Annotated[int, Field(ge=1, le=2**31 - 1)]
Version = Annotated[int, Field(ge=1)]


class InputModel(BaseModel):
    """Request bodies reject unknown fields: no mass assignment, no silently ignored typos."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OutputModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class VersionIn(InputModel):
    version: Version


class ServerTime(OutputModel):
    server_time: datetime
