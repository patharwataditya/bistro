from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.schemas.insights import AuditPage, DashboardOut, ReportOut
from app.services import insights

router = APIRouter(route_class=TransactionalRoute, tags=["insights"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DB, actor: Annotated[Actor, Depends(require("dashboard.view"))]) -> DashboardOut:
    """Operational snapshot. Each section is null when the caller lacks its permission."""
    return insights.dashboard(db, actor)


@router.get("/reports/summary", response_model=ReportOut)
def report(db: DB, actor: Annotated[Actor, Depends(require("reports.view"))],
           start: date, end: date) -> ReportOut:
    """Sales and operations for [start, end] in the location's local calendar days."""
    return insights.report(db, actor, start, end)


@router.get("/audit-logs", response_model=AuditPage)
def audit_logs(
    db: DB,
    actor: Annotated[Actor, Depends(require("audit_logs.view"))],
    before_id: int | None = None,
    entity_type: Annotated[str | None, Query(max_length=32)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    actor_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AuditPage:
    return insights.audit_logs(db, actor, before_id=before_id, entity_type=entity_type,
                               action_prefix=action, actor_id=actor_id, limit=limit)


