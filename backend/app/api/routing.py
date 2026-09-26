from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool


class TransactionalRoute(APIRoute):
    """Commits the request's DB session after the endpoint returns but before the response
    leaves the server. If the commit fails, the client gets an error, never a false success."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            response = await original(request)
            session: Session | None = getattr(request.state, "db", None)
            if session is not None and response.status_code < 400:
                await run_in_threadpool(session.commit)
            return response

        return handler
