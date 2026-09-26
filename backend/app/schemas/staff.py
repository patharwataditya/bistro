from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.schemas.auth import Password, Username, check_password_strength
from app.schemas.common import InputModel, Name, OutputModel, ShortText, Version

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
RoleIds = Annotated[list[int], Field(min_length=1, max_length=20)]


class PermissionOut(OutputModel):
    code: str
    group: str
    description: str


class RoleSummary(OutputModel):
    id: int
    name: str


class RoleOut(OutputModel):
    id: int
    name: str
    description: str | None
    is_system: bool
    permissions: list[str]
    member_count: int
    version: int
    editable: bool


class RoleCreate(InputModel):
    name: Name
    description: ShortText | None = None
    permissions: Annotated[list[str], Field(max_length=100)]


class RoleUpdate(InputModel):
    version: Version
    name: Name | None = None
    description: ShortText | None = None
    permissions: Annotated[list[str] | None, Field(max_length=100)] = None


class UserOut(OutputModel):
    id: int
    username: str
    full_name: str
    is_active: bool
    roles: list[RoleSummary]
    last_login_at: datetime | None
    created_at: datetime
    version: int
    manageable: bool


class UserCreate(InputModel):
    username: Username
    full_name: FullName
    password: Password
    role_ids: RoleIds

    _strength = field_validator("password")(check_password_strength)


class UserUpdate(InputModel):
    version: Version
    full_name: FullName | None = None
    role_ids: RoleIds | None = None


class ResetPasswordIn(InputModel):
    version: Version
    new_password: Password

    _strength = field_validator("new_password")(check_password_strength)


class LocationBrief(OutputModel):
    id: int
    name: str
    timezone: str
    currency_code: str


class MeOut(OutputModel):
    id: int
    username: str
    full_name: str
    roles: list[RoleSummary]
    permissions: list[str]
    location: LocationBrief
    restaurant_name: str
