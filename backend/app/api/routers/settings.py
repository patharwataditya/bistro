from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.schemas.settings import (
    PaymentMethodIn,
    PaymentMethodOut,
    PaymentMethodUpdate,
    SettingsOut,
    SettingsUpdate,
    TaxRatesIn,
)
from app.services import settings

router = APIRouter(route_class=TransactionalRoute, tags=["settings"])


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: DB, actor: Annotated[Actor, Depends(require("settings.view"))]) -> SettingsOut:
    return settings.get_settings_out(db, actor)


@router.patch("/settings", response_model=SettingsOut)
def update_settings(body: SettingsUpdate, db: DB,
                    actor: Annotated[Actor, Depends(require("settings.update"))]) -> SettingsOut:
    return settings.update_settings(db, actor, body)


@router.put("/settings/tax-rates", response_model=SettingsOut)
def replace_tax_rates(body: TaxRatesIn, db: DB,
                      actor: Annotated[Actor, Depends(require("settings.update"))]
                      ) -> SettingsOut:
    """Replace the tax table. Issued bills keep the rates they were issued with."""
    return settings.replace_tax_rates(db, actor, body)


@router.get("/payment-methods", response_model=list[PaymentMethodOut])
def list_payment_methods(db: DB, actor: Annotated[Actor, Depends(require("billing.view"))]
                         ) -> list[PaymentMethodOut]:
    return [PaymentMethodOut.model_validate(m)
            for m in settings.payment_methods(db, actor, active_only=True)]


@router.post("/payment-methods", response_model=PaymentMethodOut,
             status_code=status.HTTP_201_CREATED)
def create_payment_method(body: PaymentMethodIn, db: DB,
                          actor: Annotated[Actor, Depends(require("settings.update"))]
                          ) -> PaymentMethodOut:
    return PaymentMethodOut.model_validate(settings.create_payment_method(db, actor, body))


@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodOut)
def update_payment_method(method_id: int, body: PaymentMethodUpdate, db: DB,
                          actor: Annotated[Actor, Depends(require("settings.update"))]
                          ) -> PaymentMethodOut:
    return PaymentMethodOut.model_validate(
        settings.update_payment_method(db, actor, method_id, body))
