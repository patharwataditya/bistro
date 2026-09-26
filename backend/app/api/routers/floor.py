from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.schemas.floor import (
    AreaIn,
    AreaOut,
    AreaUpdate,
    FloorOut,
    TableIn,
    TableOut,
    TableStatusIn,
    TableUpdate,
)
from app.services import floor

router = APIRouter(route_class=TransactionalRoute, tags=["tables"])


@router.get("/tables", response_model=FloorOut)
def get_floor(db: DB, actor: Annotated[Actor, Depends(require("tables.view"))]) -> FloorOut:
    """Every area and table with its live order summary. Poll this for the floor view."""
    return floor.floor(db, actor)


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED)
def create_table(body: TableIn, db: DB,
                 actor: Annotated[Actor, Depends(require("tables.create"))]) -> TableOut:
    return floor.table_out(db, actor, floor.create_table(db, actor, body))


@router.patch("/tables/{table_id}", response_model=TableOut)
def update_table(table_id: int, body: TableUpdate, db: DB,
                 actor: Annotated[Actor, Depends(require("tables.update"))]) -> TableOut:
    return floor.table_out(db, actor, floor.update_table(db, actor, table_id, body))


@router.delete("/tables/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(table_id: int, db: DB,
                 actor: Annotated[Actor, Depends(require("tables.delete"))]) -> None:
    floor.delete_table(db, actor, table_id)


@router.post("/tables/{table_id}/status", response_model=TableOut)
def set_table_status(table_id: int, body: TableStatusIn, db: DB,
                     actor: Annotated[Actor, Depends(require("tables.manage_status"))]
                     ) -> TableOut:
    """Mark a table AVAILABLE / RESERVED / CLEANING / BLOCKED. OCCUPIED is set only by orders."""
    return floor.table_out(db, actor, floor.set_status(db, actor, table_id, body))


@router.get("/table-areas", response_model=list[AreaOut])
def list_areas(db: DB, actor: Annotated[Actor, Depends(require("tables.view"))]) -> list[AreaOut]:
    return [AreaOut.model_validate(a) for a in floor.list_areas(db, actor)]


@router.post("/table-areas", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
def create_area(body: AreaIn, db: DB,
                actor: Annotated[Actor, Depends(require("tables.create"))]) -> AreaOut:
    return AreaOut.model_validate(floor.create_area(db, actor, body))


@router.patch("/table-areas/{area_id}", response_model=AreaOut)
def update_area(area_id: int, body: AreaUpdate, db: DB,
                actor: Annotated[Actor, Depends(require("tables.update"))]) -> AreaOut:
    return AreaOut.model_validate(floor.update_area(db, actor, area_id, body))


@router.delete("/table-areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_area(area_id: int, db: DB,
                actor: Annotated[Actor, Depends(require("tables.delete"))]) -> None:
    floor.delete_area(db, actor, area_id)
