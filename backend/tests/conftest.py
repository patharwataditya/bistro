import os

os.environ.setdefault(
    "BISTRO_DATABASE_URL", "postgresql+psycopg://bistro:bistro@localhost:5544/bistro_test"
)
os.environ["BISTRO_ENVIRONMENT"] = "test"

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db, session_factory
from app.main import app
from app.seed import DEMO_PASSWORD, seed_demo

URL = get_settings().database_url


def _reset_schema() -> None:
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    engine.dispose()
    cfg = Config("alembic.ini")
    cfg.attributes["database_url"] = URL
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    _reset_schema()
    with session_factory()() as db, db.begin():
        seed_demo(db)
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    """A session whose commits are savepoints inside one outer transaction rolled back after
    the test: every test sees the pristine demo seed."""
    engine = session_factory().kw["bind"]
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint",
                      expire_on_commit=False, autoflush=False)
    yield session
    session.close()
    outer.rollback()
    connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    def override() -> Iterator[Session]:
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class Api:
    """Thin helper: logged-in requests against /api/v1 as a given demo user."""

    def __init__(self, client: TestClient, username: str, password: str = DEMO_PASSWORD) -> None:
        self.client = client
        self.username = username
        response = client.post("/api/v1/auth/login",
                               json={"username": username, "password": password})
        assert response.status_code == 200, response.text
        self.tokens = response.json()
        self.headers = {"Authorization": f"Bearer {self.tokens['access_token']}"}

    def _call(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {**self.headers, **kwargs.pop("headers", {})}
        return self.client.request(method, f"/api/v1{path}", headers=headers, **kwargs)

    def get(self, path: str, **kw: Any) -> Any:
        return self._call("GET", path, **kw)

    def post(self, path: str, json: Any = None, **kw: Any) -> Any:
        return self._call("POST", path, json=json, **kw)

    def patch(self, path: str, json: Any = None, **kw: Any) -> Any:
        return self._call("PATCH", path, json=json, **kw)

    def put(self, path: str, json: Any = None, **kw: Any) -> Any:
        return self._call("PUT", path, json=json, **kw)

    def delete(self, path: str, **kw: Any) -> Any:
        return self._call("DELETE", path, **kw)


@pytest.fixture
def as_user(client: TestClient) -> Callable[..., Api]:
    return lambda username, password=DEMO_PASSWORD: Api(client, username, password)


def ok(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, f"{response.status_code}: {response.text}"
    return response.json() if response.content else None


def err(response: Any, status: int, code: str) -> Any:
    assert response.status_code == status, f"{response.status_code}: {response.text}"
    body = response.json()
    assert body["error"]["code"] == code, body
    return body["error"]
