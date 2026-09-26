from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.schemas.common import InputModel, OutputModel

Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=40,
                                            pattern=r"^[A-Za-z0-9._-]+$")]
Password = Annotated[str, Field(min_length=8, max_length=128)]


def check_password_strength(value: str) -> str:
    if value.strip() != value:
        raise ValueError("Password cannot start or end with spaces")
    if value.isdigit() or value.isalpha():
        raise ValueError("Password must mix letters with numbers or symbols")
    return value


class LoginIn(InputModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    password: Annotated[str, Field(min_length=1, max_length=128)]
    device_label: Annotated[str | None, StringConstraints(max_length=120)] = None


class RefreshIn(InputModel):
    refresh_token: Annotated[str, Field(min_length=20, max_length=200)]


class ChangePasswordIn(InputModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Password

    _strength = field_validator("new_password")(check_password_strength)


class TokenPair(OutputModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
