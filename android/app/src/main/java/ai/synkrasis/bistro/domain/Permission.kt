package ai.synkrasis.bistro.domain

/**
 * Permission codes (contract/enums.json). The app uses them only to decide what to *show*;
 * the server independently authorises every request.
 */
object Permission {
    const val DASHBOARD_VIEW = "dashboard.view"
    const val TABLES_VIEW = "tables.view"
    const val TABLES_CREATE = "tables.create"
    const val TABLES_UPDATE = "tables.update"
    const val TABLES_DELETE = "tables.delete"
    const val TABLES_MANAGE_STATUS = "tables.manage_status"
    const val ORDERS_VIEW = "orders.view"
    const val ORDERS_CREATE = "orders.create"
    const val ORDERS_UPDATE = "orders.update"
    const val ORDERS_CANCEL = "orders.cancel"
    const val ORDERS_TRANSFER = "orders.transfer"
    const val KITCHEN_VIEW = "kitchen.view"
    const val KITCHEN_UPDATE = "kitchen.update"
    const val BILLING_VIEW = "billing.view"
    const val BILLING_CREATE = "billing.create"
    const val BILLING_DISCOUNT = "billing.discount"
    const val BILLING_VOID = "billing.void"
    const val BILLING_PROCESS_PAYMENT = "billing.process_payment"
    const val BILLING_REFUND = "billing.refund"
    const val MENU_VIEW = "menu.view"
    const val MENU_CREATE = "menu.create"
    const val MENU_UPDATE = "menu.update"
    const val MENU_SET_AVAILABILITY = "menu.set_availability"
    const val MENU_DELETE = "menu.delete"
    const val MENU_MANAGE_CATEGORIES = "menu.manage_categories"
    const val STAFF_VIEW = "staff.view"
    const val STAFF_CREATE = "staff.create"
    const val STAFF_UPDATE = "staff.update"
    const val STAFF_DEACTIVATE = "staff.deactivate"
    const val ROLES_VIEW = "roles.view"
    const val ROLES_CREATE = "roles.create"
    const val ROLES_UPDATE = "roles.update"
    const val ROLES_DELETE = "roles.delete"
    const val REPORTS_VIEW = "reports.view"
    const val SETTINGS_VIEW = "settings.view"
    const val SETTINGS_UPDATE = "settings.update"
    const val AUDIT_LOGS_VIEW = "audit_logs.view"

    val ALL: Set<String> = setOf(
        DASHBOARD_VIEW, TABLES_VIEW, TABLES_CREATE, TABLES_UPDATE, TABLES_DELETE,
        TABLES_MANAGE_STATUS, ORDERS_VIEW, ORDERS_CREATE, ORDERS_UPDATE, ORDERS_CANCEL,
        ORDERS_TRANSFER, KITCHEN_VIEW, KITCHEN_UPDATE, BILLING_VIEW, BILLING_CREATE,
        BILLING_DISCOUNT, BILLING_VOID, BILLING_PROCESS_PAYMENT, BILLING_REFUND, MENU_VIEW,
        MENU_CREATE, MENU_UPDATE, MENU_SET_AVAILABILITY, MENU_DELETE, MENU_MANAGE_CATEGORIES,
        STAFF_VIEW, STAFF_CREATE, STAFF_UPDATE, STAFF_DEACTIVATE, ROLES_VIEW, ROLES_CREATE,
        ROLES_UPDATE, ROLES_DELETE, REPORTS_VIEW, SETTINGS_VIEW, SETTINGS_UPDATE, AUDIT_LOGS_VIEW,
    )
}

/** The caller's permission set with readable checks. */
@JvmInline
value class Grants(val codes: Set<String>) {
    fun has(permission: String): Boolean = permission in codes
    fun any(vararg permissions: String): Boolean = permissions.any { it in codes }
}
