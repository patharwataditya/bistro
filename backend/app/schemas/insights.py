from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.schemas.common import OutputModel


class TableCounts(OutputModel):
    total: int
    available: int
    occupied: int
    reserved: int
    cleaning: int
    blocked: int


class KitchenCounts(OutputModel):
    new: int
    preparing: int
    ready: int
    oldest_active_fired_at: datetime | None


class SalesToday(OutputModel):
    net_sales: Decimal
    paid_bills: int
    average_bill: Decimal


class ActivityOut(OutputModel):
    id: int
    action: str
    summary: str
    actor_name: str | None
    created_at: datetime


class DashboardOut(OutputModel):
    server_time: datetime
    business_date: date
    currency_code: str
    tables: TableCounts | None
    kitchen: KitchenCounts | None
    open_orders: int | None
    ready_items: int | None
    open_bills: int | None
    open_bills_amount: Decimal | None
    sales_today: SalesToday | None
    recent_activity: list[ActivityOut] | None


class NamedAmount(OutputModel):
    name: str
    count: int
    amount: Decimal


class TopItem(OutputModel):
    menu_item_id: int
    name: str
    quantity: int
    revenue: Decimal


class TableUsage(OutputModel):
    table_name: str
    orders: int
    revenue: Decimal
    average_minutes: int


class DailySales(OutputModel):
    date: date
    gross_sales: Decimal
    refunds: Decimal
    net_sales: Decimal
    orders: int


class HourlySales(OutputModel):
    """Gross sales by the local hour the bill was settled."""

    hour: int
    sales: Decimal
    orders: int


class ReportOut(OutputModel):
    start_date: date
    end_date: date
    currency_code: str
    gross_sales: Decimal
    refunds: Decimal
    net_sales: Decimal
    order_count: int
    average_order_value: Decimal
    guests: int
    discounts_total: Decimal
    discounted_bills: int
    tax_total: Decimal
    service_charge_total: Decimal
    cancelled_orders: int
    voided_items_value: Decimal
    daily: list[DailySales]
    hourly: list[HourlySales]
    top_items: list[TopItem]
    payment_methods: list[NamedAmount]
    tables: list[TableUsage]
    staff: list[NamedAmount]


class AuditLogOut(OutputModel):
    id: int
    action: str
    entity_type: str
    entity_id: str | None
    summary: str
    actor_id: int | None
    actor_name: str | None
    metadata: dict[str, Any]
    created_at: datetime


class AuditPage(OutputModel):
    items: list[AuditLogOut]
    next_before_id: int | None
