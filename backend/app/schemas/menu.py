from decimal import Decimal
from typing import Annotated

from pydantic import StringConstraints

from app.schemas.common import InputModel, MoneyIn, Name, OutputModel, Version
from app.schemas.floor import SortOrder

ItemName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class CategoryOut(OutputModel):
    id: int
    name: str
    sort_order: int
    item_count: int


class CategoryIn(InputModel):
    name: Name
    sort_order: SortOrder = 0


class CategoryUpdate(InputModel):
    name: Name | None = None
    sort_order: SortOrder | None = None


class MenuItemOut(OutputModel):
    id: int
    category_id: int
    name: str
    description: str | None
    price: Decimal
    is_available: bool
    sort_order: int
    version: int


class MenuItemIn(InputModel):
    category_id: int
    name: ItemName
    description: Description | None = None
    price: MoneyIn
    is_available: bool = True
    sort_order: SortOrder = 0


class MenuItemUpdate(InputModel):
    version: Version
    category_id: int | None = None
    name: ItemName | None = None
    description: Description | None = None
    price: MoneyIn | None = None
    sort_order: SortOrder | None = None


class AvailabilityIn(InputModel):
    version: Version
    is_available: bool


class MenuOut(OutputModel):
    categories: list[CategoryOut]
    items: list[MenuItemOut]
