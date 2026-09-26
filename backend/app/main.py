from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.middleware import RequestContextMiddleware
from app.api.routers import auth, billing, floor, insights, kitchen, menu, orders, staff
from app.api.routers import settings as settings_router
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger

log = get_logger("bistro")
API_PREFIX = "/api/v1"


def _error(status: int, code: str, message: str, details: dict[str, Any] | None = None,
           headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, "details": details or {}}},
                        status_code=status, headers=headers)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    log.info("startup", environment=settings.environment)
    yield
    get_engine().dispose()
    log.info("shutdown")


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    docs = not settings.is_production
    app = FastAPI(
        title="Bistro API",
        version="1.0.0",
        description="Restaurant operations API. All endpoints except /auth/* and /health "
                    "require a Bearer access token; each documents the permission it needs.",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs" if docs else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if docs else None,
    )
    app.add_middleware(RequestContextMiddleware, max_body_bytes=settings.max_body_bytes)

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return _error(exc.status_code, exc.code, exc.message, exc.details, headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"field": ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path")),
             "message": err["msg"]}
            for err in exc.errors()
        ]
        return _error(422, "VALIDATION_ERROR", "Some fields need attention.", {"fields": fields})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "NOT_FOUND", 401: "UNAUTHENTICATED",
                403: "PERMISSION_DENIED"}.get(exc.status_code, "VALIDATION_ERROR")
        message = "Not found." if exc.status_code in (404, 405) else str(exc.detail)
        return _error(exc.status_code, code, message)

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("integrity_error", error=str(exc.orig)[:300])
        return _error(409, "CONFLICT", "That conflicts with existing data. Refresh and try again.")

    @app.exception_handler(DataError)
    async def data_error(_: Request, exc: DataError) -> JSONResponse:
        # e.g. an id beyond the integer range: bad input, not a server fault.
        return _error(422, "VALIDATION_ERROR", "Some values are out of range.")

    @app.exception_handler(OperationalError)
    async def db_unavailable(_: Request, exc: OperationalError) -> JSONResponse:
        log.error("database_error", error=str(exc.orig)[:300])
        return _error(503, "INTERNAL_ERROR", "The service is temporarily unavailable.")

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error_type=type(exc).__name__)
        return _error(500, "INTERNAL_ERROR", "Something failed on our side. Please try again.")

    api = APIRouter(prefix=API_PREFIX)

    @api.api_route("/health", methods=["GET", "HEAD"], tags=["system"])
    def health() -> JSONResponse:
        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse({"status": "degraded", "database": "unreachable"},
                                status_code=503)
        return JSONResponse({"status": "ok", "database": "ok",
                             "time": datetime.now(UTC).isoformat()})

    for module in (auth, staff, floor, menu, orders, kitchen, billing, settings_router,
                   insights):
        api.include_router(module.router)
    app.include_router(api)
    return app


app = create_app()
