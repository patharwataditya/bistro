from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (and `.env` in development)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="BISTRO_", extra="ignore")

    environment: Literal["development", "test", "production"] = "production"
    database_url: str = "postgresql+psycopg://bistro:bistro@localhost:5544/bistro"
    jwt_secret: SecretStr = SecretStr("dev-only-insecure-secret-change-me-0123456789")
    jwt_issuer: str = "bistro-api"
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_seconds: int = 30 * 24 * 60 * 60
    login_max_failures: int = 5
    login_lockout_seconds: int = 15 * 60
    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = "INFO"
    max_body_bytes: int = 256 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        # Fail closed: anything that is not explicitly development/test is production, and
        # production refuses to start with the public development secret.
        if self.is_production:
            secret = self.jwt_secret.get_secret_value()
            if len(secret) < 32 or secret.startswith("dev-only"):
                raise ValueError("BISTRO_JWT_SECRET must be a strong, non-default secret")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
