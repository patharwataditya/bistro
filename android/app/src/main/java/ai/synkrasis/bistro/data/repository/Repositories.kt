package ai.synkrasis.bistro.data.repository

import ai.synkrasis.bistro.core.network.ApiCaller
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.data.api.AddItemsIn
import ai.synkrasis.bistro.data.api.AreaIn
import ai.synkrasis.bistro.data.api.AvailabilityIn
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.BillCreate
import ai.synkrasis.bistro.data.api.BillSummary
import ai.synkrasis.bistro.data.api.BistroApi
import ai.synkrasis.bistro.data.api.CancelOrderIn
import ai.synkrasis.bistro.data.api.CategoryIn
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.DiscountIn
import ai.synkrasis.bistro.data.api.ItemUpdate
import ai.synkrasis.bistro.data.api.MenuItemIn
import ai.synkrasis.bistro.data.api.MenuItemUpdate
import ai.synkrasis.bistro.data.api.MergeIn
import ai.synkrasis.bistro.data.api.OrderCreate
import ai.synkrasis.bistro.data.api.OrderItemIn
import ai.synkrasis.bistro.data.api.OrderUpdate
import ai.synkrasis.bistro.data.api.PaymentIn
import ai.synkrasis.bistro.data.api.PaymentMethodIn
import ai.synkrasis.bistro.data.api.PaymentMethodUpdate
import ai.synkrasis.bistro.data.api.ReasonIn
import ai.synkrasis.bistro.data.api.RefundIn
import ai.synkrasis.bistro.data.api.ResetPasswordIn
import ai.synkrasis.bistro.data.api.RoleCreate
import ai.synkrasis.bistro.data.api.RoleUpdate
import ai.synkrasis.bistro.data.api.SettingsUpdate
import ai.synkrasis.bistro.data.api.SplitIn
import ai.synkrasis.bistro.data.api.TableIn
import ai.synkrasis.bistro.data.api.TableStatusIn
import ai.synkrasis.bistro.data.api.TableUpdate
import ai.synkrasis.bistro.data.api.TaxRatesIn
import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.data.api.TicketTransitionIn
import ai.synkrasis.bistro.data.api.TransferIn
import ai.synkrasis.bistro.data.api.UserCreate
import ai.synkrasis.bistro.data.api.UserUpdate
import ai.synkrasis.bistro.data.api.VersionIn
import ai.synkrasis.bistro.data.api.VoidBillIn
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.TicketStatus
import java.math.BigDecimal
import java.time.LocalDate

/*
 * Repositories are the boundary between the network and the app: every call returns an
 * ApiResult, never throws, and carries the idempotency keys and versions the server needs.
 * Restaurant-critical state is not cached here — correctness beats a stale-but-fast screen.
 */

class FloorRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun floor() = call { api.floor() }
    suspend fun setStatus(table: DiningTable, status: TableStatus, note: String?) =
        call { api.setTableStatus(table.id, TableStatusIn(table.version, status, note?.ifBlank { null })) }
    suspend fun createTable(name: String, capacity: Int, areaId: Int?) =
        call { api.createTable(TableIn(name.trim(), capacity, areaId)) }
    suspend fun updateTable(table: DiningTable, name: String, capacity: Int, areaId: Int?) = call {
        api.updateTable(
            table.id,
            TableUpdate(table.version, name = name.trim(), capacity = capacity, areaId = areaId, clearArea = areaId == null),
        )
    }
    suspend fun deleteTable(id: Int) = call { api.deleteTable(id) }
    suspend fun createArea(name: String) = call { api.createArea(AreaIn(name.trim())) }
    suspend fun deleteArea(id: Int) = call { api.deleteArea(id) }
}

class MenuRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun menu() = call { api.menu() }
    suspend fun createCategory(name: String) = call { api.createCategory(CategoryIn(name.trim())) }
    suspend fun renameCategory(id: Int, name: String, sortOrder: Int) = call { api.updateCategory(id, CategoryIn(name.trim(), sortOrder)) }
    suspend fun deleteCategory(id: Int) = call { api.deleteCategory(id) }
    suspend fun createItem(body: MenuItemIn) = call { api.createMenuItem(body) }
    suspend fun updateItem(id: Int, body: MenuItemUpdate) = call { api.updateMenuItem(id, body) }
    suspend fun setAvailability(id: Int, version: Int, available: Boolean) =
        call { api.setAvailability(id, AvailabilityIn(version, available)) }
    suspend fun deleteItem(id: Int) = call { api.deleteMenuItem(id) }
}

class OrderRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun list(statuses: List<OrderStatus>?, limit: Int = 50, offset: Int = 0) =
        call { api.orders(statuses?.map { it.wire }, limit, offset) }
    suspend fun open(key: String, tableId: Int, guests: Int, items: List<OrderItemIn> = emptyList()) =
        call { api.openOrder(key, OrderCreate(tableId, guests, items = items)) }
    suspend fun get(id: Int) = call { api.order(id) }
    suspend fun update(id: Int, version: Int, guests: Int?, notes: String?) =
        call { api.updateOrder(id, OrderUpdate(version, guests, notes)) }
    suspend fun addItems(id: Int, key: String, items: List<OrderItemIn>) = call { api.addItems(id, key, AddItemsIn(items)) }
    suspend fun updateItem(id: Int, itemId: Int, quantity: Int?, notes: String?) =
        call { api.updateItem(id, itemId, ItemUpdate(quantity, notes)) }
    suspend fun removeItem(id: Int, itemId: Int) = call { api.removeItem(id, itemId) }
    suspend fun voidItem(id: Int, itemId: Int, reason: String) = call { api.voidItem(id, itemId, ReasonIn(reason.trim())) }
    suspend fun serveItem(id: Int, itemId: Int) = call { api.serveItem(id, itemId) }
    suspend fun fire(id: Int, version: Int, key: String) = call { api.fire(id, key, VersionIn(version)) }
    suspend fun cancel(id: Int, version: Int, reason: String) = call { api.cancelOrder(id, CancelOrderIn(version, reason.trim())) }
    suspend fun transfer(id: Int, version: Int, tableId: Int) = call { api.transfer(id, TransferIn(version, tableId)) }
    suspend fun merge(id: Int, version: Int, sourceId: Int, sourceVersion: Int) =
        call { api.merge(id, MergeIn(version, sourceId, sourceVersion)) }
    suspend fun split(id: Int, version: Int, tableId: Int, itemIds: List<Int>, guests: Int) =
        call { api.split(id, SplitIn(version, tableId, itemIds, guests)) }
}

class KitchenRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun board() = call { api.kitchen(includeRecent = true) }
    suspend fun transition(ticket: Ticket, to: TicketStatus): ApiResult<Ticket> =
        call { api.transitionTicket(ticket.id, TicketTransitionIn(ticket.version, to)) }
}

class BillingRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun list(
        statuses: List<BillStatus>?,
        limit: Int = 50,
        offset: Int = 0,
        paidSince: java.time.Instant? = null,
    ): ApiResult<ai.synkrasis.bistro.data.api.Page<BillSummary>> =
        call { api.bills(statuses?.map { it.wire }, paidSince?.toString(), limit, offset) }
    suspend fun create(key: String, orderId: Int, orderVersion: Int) = call { api.createBill(key, BillCreate(orderId, orderVersion)) }
    suspend fun get(id: Int) = call { api.bill(id) }
    suspend fun discount(bill: Bill, type: DiscountType?, value: BigDecimal?, reason: String?) =
        call { api.discount(bill.id, DiscountIn(bill.version, type, value, reason?.trim())) }
    suspend fun void(bill: Bill, reason: String) = call { api.voidBill(bill.id, VoidBillIn(bill.version, reason.trim())) }
    suspend fun pay(bill: Bill, key: String, methodId: Int, amount: BigDecimal, tendered: BigDecimal?, reference: String?) =
        call { api.pay(bill.id, key, PaymentIn(bill.version, methodId, amount, tendered, reference?.ifBlank { null })) }
    suspend fun settleZero(bill: Bill) = call { api.settleZero(bill.id, VersionIn(bill.version)) }
    suspend fun refund(bill: Bill, key: String, methodId: Int, amount: BigDecimal, reason: String) =
        call { api.refund(bill.id, key, RefundIn(bill.version, methodId, amount, reason.trim())) }
    suspend fun paymentMethods() = call { api.paymentMethods() }
}

class StaffRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun users(includeInactive: Boolean) = call { api.users(includeInactive) }
    suspend fun create(body: UserCreate) = call { api.createUser(body) }
    suspend fun update(id: Int, body: UserUpdate) = call { api.updateUser(id, body) }
    suspend fun deactivate(id: Int, version: Int) = call { api.deactivateUser(id, VersionIn(version)) }
    suspend fun reactivate(id: Int, version: Int) = call { api.reactivateUser(id, VersionIn(version)) }
    suspend fun resetPassword(id: Int, version: Int, password: String) = call { api.resetPassword(id, ResetPasswordIn(version, password)) }
    suspend fun roles() = call { api.roles() }
    suspend fun permissions() = call { api.permissions() }
    suspend fun createRole(body: RoleCreate) = call { api.createRole(body) }
    suspend fun updateRole(id: Int, body: RoleUpdate) = call { api.updateRole(id, body) }
    suspend fun deleteRole(id: Int) = call { api.deleteRole(id) }
}

class SettingsRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun get() = call { api.settings() }
    suspend fun update(body: SettingsUpdate) = call { api.updateSettings(body) }
    suspend fun replaceTaxes(body: TaxRatesIn) = call { api.replaceTaxRates(body) }
    suspend fun createPaymentMethod(body: PaymentMethodIn) = call { api.createPaymentMethod(body) }
    suspend fun updatePaymentMethod(id: Int, body: PaymentMethodUpdate) = call { api.updatePaymentMethod(id, body) }
}

class InsightsRepository(private val api: BistroApi, private val call: ApiCaller) {
    suspend fun dashboard() = call { api.dashboard() }
    suspend fun report(start: LocalDate, end: LocalDate) = call { api.report(start.toString(), end.toString()) }
    suspend fun audit(beforeId: Int?, action: String?) = call { api.auditLogs(beforeId, action?.ifBlank { null }) }
}
