from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.schemas.menu import (
    AvailabilityIn,
    CategoryIn,
    CategoryOut,
    CategoryUpdate,
    MenuItemIn,
    MenuItemOut,
    MenuItemUpdate,
    MenuOut,
)
from app.services import menu

router = APIRouter(route_class=TransactionalRoute, prefix="/menu", tags=["menu"])


@router.get("", response_model=MenuOut)
def get_menu(db: DB, actor: Annotated[Actor, Depends(require("menu.view"))]) -> MenuOut:
    return menu.menu(db, actor)


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryIn, db: DB,
                    actor: Annotated[Actor, Depends(require("menu.manage_categories"))]
                    ) -> CategoryOut:
    return menu.category_out(db, menu.create_category(db, actor, body))


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryUpdate, db: DB,
                    actor: Annotated[Actor, Depends(require("menu.manage_categories"))]
                    ) -> CategoryOut:
    return menu.category_out(db, menu.update_category(db, actor, category_id, body))


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: DB,
                    actor: Annotated[Actor, Depends(require("menu.manage_categories"))]) -> None:
    menu.delete_category(db, actor, category_id)


@router.post("/items", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def create_item(body: MenuItemIn, db: DB,
                actor: Annotated[Actor, Depends(require("menu.create"))]) -> MenuItemOut:
    return MenuItemOut.model_validate(menu.create_item(db, actor, body))


@router.patch("/items/{item_id}", response_model=MenuItemOut)
def update_item(item_id: int, body: MenuItemUpdate, db: DB,
                actor: Annotated[Actor, Depends(require("menu.update"))]) -> MenuItemOut:
    """Edit an item. Price changes apply to new order lines only; history is snapshotted."""
    return MenuItemOut.model_validate(menu.update_item(db, actor, item_id, body))


@router.post("/items/{item_id}/availability", response_model=MenuItemOut)
def set_availability(item_id: int, body: AvailabilityIn, db: DB,
                     actor: Annotated[Actor, Depends(require("menu.set_availability"))]
                     ) -> MenuItemOut:
    """Sold out / back on. Existing order lines are unaffected; new ones are refused."""
    return MenuItemOut.model_validate(menu.set_availability(db, actor, item_id, body))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, db: DB,
                actor: Annotated[Actor, Depends(require("menu.delete"))]) -> None:
    menu.delete_item(db, actor, item_id)
