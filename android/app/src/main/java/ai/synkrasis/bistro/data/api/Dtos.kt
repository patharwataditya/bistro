@file:UseSerializers(BigDecimalSerializer::class, InstantSerializer::class, LocalDateSerializer::class)

package ai.synkrasis.bistro.data.api

import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import ai.synkrasis.bistro.domain.OrderItemStatus
import ai.synkrasis.bistro.domain.OrderStatus
import ai.synkrasis.bistro.domain.PaymentKind
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.TicketStatus
import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.json.JsonObject
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

// Field names follow the API's snake_case via the Json naming strategy in ApiModule.

// ---------- common ----------

@Serializable
data class Page<T>(val items: List<T>, val total: Int, val limit: Int, val offset: Int)

@Serializable
data class ErrorEnvelope(val error: ErrorBody)

@Serializable
data class ErrorBody(val code: String, val message: String, val details: JsonObject = JsonObject(emptyMap()))

@Serializable
data class VersionIn(val version: Int)

// ---------- auth ----------

@Serializable
data class LoginIn(val username: String, val password: String, val deviceLabel: String?)

@Serializable
data class RefreshIn(val refreshToken: String)

@Serializable
data class TokenPair(val accessToken: String, val refreshToken: String, val expiresIn: Int)

@Serializable
data class ChangePasswordIn(val currentPassword: String, val newPassword: String)

@Immutable
@Serializable
data class RoleSummary(val id: Int, val name: String)

@Immutable
@Serializable
data class LocationBrief(val id: Int, val name: String, val timezone: String, val currencyCode: String)

@Immutable
@Serializable
data class Me(
    val id: Int,
    val username: String,
    val fullName: String,
    val roles: List<RoleSummary>,
    val permissions: List<String>,
    val location: LocationBrief,
    val restaurantName: String,
)

// ---------- floor ----------

@Immutable
@Serializable
data class Area(val id: Int, val name: String, val sortOrder: Int)

@Immutable
@Serializable
data class ActiveOrderBrief(
    val id: Int,
    val orderNumber: Int,
    val status: OrderStatus,
    val guestCount: Int,
    val openedAt: Instant,
    val serverName: String,
    val itemCount: Int,
    val pendingCount: Int,
    val readyCount: Int,
    val subtotal: BigDecimal,
    val billId: Int?,
    val version: Int,
)

@Immutable
@Serializable
data class DiningTable(
    val id: Int,
    val name: String,
    val capacity: Int,
    val areaId: Int?,
    val areaName: String?,
    val status: TableStatus,
    val statusNote: String?,
    val sortOrder: Int,
    val version: Int,
    val activeOrder: ActiveOrderBrief?,
)

@Immutable
@Serializable
data class Floor(val areas: List<Area>, val tables: List<DiningTable>, val serverTime: Instant)

@Serializable
data class TableIn(val name: String, val capacity: Int, val areaId: Int?, val sortOrder: Int = 0)

@Serializable
data class TableUpdate(
    val version: Int,
    val name: String? = null,
    val capacity: Int? = null,
    val areaId: Int? = null,
    val clearArea: Boolean = false,
    val sortOrder: Int? = null,
)

@Serializable
data class TableStatusIn(val version: Int, val status: TableStatus, val note: String?)

@Serializable
data class AreaIn(val name: String, val sortOrder: Int = 0)

// ---------- menu ----------

@Immutable
@Serializable
data class MenuCategory(val id: Int, val name: String, val sortOrder: Int, val itemCount: Int)

@Immutable
@Serializable
data class MenuItem(
    val id: Int,
    val categoryId: Int,
    val name: String,
    val description: String?,
    val price: BigDecimal,
    val isAvailable: Boolean,
    val sortOrder: Int,
    val version: Int,
)

@Immutable
@Serializable
data class Menu(val categories: List<MenuCategory>, val items: List<MenuItem>)

@Serializable
data class CategoryIn(val name: String, val sortOrder: Int = 0)

@Serializable
data class MenuItemIn(
    val categoryId: Int,
    val name: String,
    val description: String?,
    val price: BigDecimal,
    val isAvailable: Boolean = true,
    val sortOrder: Int = 0,
)

@Serializable
data class MenuItemUpdate(
    val version: Int,
    val categoryId: Int? = null,
    val name: String? = null,
    val description: String? = null,
    val price: BigDecimal? = null,
    val sortOrder: Int? = null,
)

@Serializable
data class AvailabilityIn(val version: Int, val isAvailable: Boolean)

// ---------- orders ----------

@Serializable
data class OrderItemIn(val menuItemId: Int, val quantity: Int = 1, val notes: String? = null)

@Serializable
data class OrderCreate(val tableId: Int, val guestCount: Int, val notes: String? = null, val items: List<OrderItemIn> = emptyList())

@Serializable
data class AddItemsIn(val items: List<OrderItemIn>)

@Serializable
data class ItemUpdate(val quantity: Int? = null, val notes: String? = null)

@Serializable
data class ReasonIn(val reason: String)

@Serializable
data class OrderUpdate(val version: Int, val guestCount: Int? = null, val notes: String? = null)

@Serializable
data class CancelOrderIn(val version: Int, val reason: String)

@Serializable
data class TransferIn(val version: Int, val tableId: Int)

@Serializable
data class MergeIn(val version: Int, val sourceOrderId: Int, val sourceVersion: Int)

@Serializable
data class SplitIn(val version: Int, val tableId: Int, val itemIds: List<Int>, val guestCount: Int)

@Immutable
@Serializable
data class OrderItem(
    val id: Int,
    val menuItemId: Int,
    val name: String,
    val unitPrice: BigDecimal,
    val quantity: Int,
    val lineTotal: BigDecimal,
    val notes: String?,
    val status: OrderItemStatus,
    val ticketId: Int?,
    val voidReason: String?,
    val createdAt: Instant,
)

@Immutable
@Serializable
data class TaxLine(val name: String, val ratePercent: BigDecimal, val taxableAmount: BigDecimal, val amount: BigDecimal)

@Immutable
@Serializable
data class Totals(
    val subtotal: BigDecimal,
    val discountAmount: BigDecimal,
    val serviceChargePercent: BigDecimal,
    val serviceChargeAmount: BigDecimal,
    val taxes: List<TaxLine>,
    val taxTotal: BigDecimal,
    val roundOff: BigDecimal,
    val total: BigDecimal,
)

@Immutable
@Serializable
data class Order(
    val id: Int,
    val orderNumber: Int,
    val status: OrderStatus,
    val tableId: Int,
    val tableName: String,
    val serverId: Int,
    val serverName: String,
    val guestCount: Int,
    val notes: String?,
    val openedAt: Instant,
    val billedAt: Instant?,
    val closedAt: Instant?,
    val cancelledAt: Instant?,
    val cancelReason: String?,
    val mergedIntoId: Int?,
    val items: List<OrderItem>,
    val totals: Totals,
    val billId: Int?,
    val currencyCode: String,
    val version: Int,
)

@Immutable
@Serializable
data class OrderSummary(
    val id: Int,
    val orderNumber: Int,
    val status: OrderStatus,
    val tableId: Int,
    val tableName: String,
    val serverName: String,
    val guestCount: Int,
    val openedAt: Instant,
    val closedAt: Instant?,
    val itemCount: Int,
    val subtotal: BigDecimal,
    val version: Int,
)

// ---------- kitchen ----------

@Immutable
@Serializable
data class TicketItem(val id: Int, val name: String, val quantity: Int, val notes: String?, val status: OrderItemStatus)

@Immutable
@Serializable
data class Ticket(
    val id: Int,
    val ticketNumber: Int,
    val status: TicketStatus,
    val orderId: Int,
    val orderNumber: Int,
    val orderStatus: OrderStatus,
    val orderNotes: String?,
    val tableName: String,
    val serverName: String,
    val firedAt: Instant,
    val acceptedAt: Instant?,
    val startedAt: Instant?,
    val readyAt: Instant?,
    val completedAt: Instant?,
    val items: List<TicketItem>,
    val version: Int,
)

@Immutable
@Serializable
data class KitchenBoard(val tickets: List<Ticket>, val serverTime: Instant)

@Serializable
data class TicketTransitionIn(val version: Int, val to: TicketStatus)

// ---------- billing ----------

@Serializable
data class BillCreate(val orderId: Int, val orderVersion: Int)

@Serializable
data class DiscountIn(val version: Int, val type: DiscountType?, val value: BigDecimal?, val reason: String?)

@Serializable
data class VoidBillIn(val version: Int, val reason: String)

@Serializable
data class PaymentIn(
    val version: Int,
    val paymentMethodId: Int,
    val amount: BigDecimal,
    val tendered: BigDecimal? = null,
    val reference: String? = null,
)

@Serializable
data class RefundIn(val version: Int, val paymentMethodId: Int, val amount: BigDecimal, val reason: String)

@Immutable
@Serializable
data class PaymentRecord(
    val id: Int,
    val kind: PaymentKind,
    val paymentMethodId: Int,
    val methodName: String,
    val amount: BigDecimal,
    val tendered: BigDecimal?,
    val changeDue: BigDecimal,
    val reference: String?,
    val reason: String?,
    val createdByName: String,
    val createdAt: Instant,
)

@Immutable
@Serializable
data class Bill(
    val id: Int,
    val billNumber: String,
    val status: BillStatus,
    val orderId: Int,
    val orderNumber: Int,
    val tableName: String,
    val serverName: String,
    val guestCount: Int,
    val currencyCode: String,
    val subtotal: BigDecimal,
    val discountType: DiscountType?,
    val discountValue: BigDecimal?,
    val discountAmount: BigDecimal,
    val discountReason: String?,
    val serviceChargePercent: BigDecimal,
    val serviceChargeAmount: BigDecimal,
    val taxes: List<TaxLine>,
    val taxTotal: BigDecimal,
    val roundOff: BigDecimal,
    val total: BigDecimal,
    val paidTotal: BigDecimal,
    val refundedTotal: BigDecimal,
    val balanceDue: BigDecimal,
    val payments: List<PaymentRecord>,
    val createdByName: String,
    val createdAt: Instant,
    val paidAt: Instant?,
    val voidedAt: Instant?,
    val voidReason: String?,
    val version: Int,
)

@Immutable
@Serializable
data class BillSummary(
    val id: Int,
    val billNumber: String,
    val status: BillStatus,
    val orderId: Int,
    val orderNumber: Int,
    val tableName: String,
    val total: BigDecimal,
    val paidTotal: BigDecimal,
    val balanceDue: BigDecimal,
    val createdAt: Instant,
    val paidAt: Instant?,
    val version: Int,
)

@Immutable
@Serializable
data class PaymentMethod(val id: Int, val name: String, val isCash: Boolean, val isActive: Boolean, val sortOrder: Int)

// ---------- staff & roles ----------

@Immutable
@Serializable
data class StaffMember(
    val id: Int,
    val username: String,
    val fullName: String,
    val isActive: Boolean,
    val roles: List<RoleSummary>,
    val lastLoginAt: Instant?,
    val createdAt: Instant,
    val version: Int,
    val manageable: Boolean,
    val passwordResettable: Boolean,
)

@Serializable
data class UserCreate(val username: String, val fullName: String, val password: String, val roleIds: List<Int>)

@Serializable
data class UserUpdate(val version: Int, val fullName: String? = null, val roleIds: List<Int>? = null)

@Serializable
data class ResetPasswordIn(val version: Int, val newPassword: String)

@Immutable
@Serializable
data class PermissionInfo(val code: String, val group: String, val description: String)

@Immutable
@Serializable
data class Role(
    val id: Int,
    val name: String,
    val description: String?,
    val isSystem: Boolean,
    val permissions: List<String>,
    val memberCount: Int,
    val version: Int,
    val editable: Boolean,
)

@Serializable
data class RoleCreate(val name: String, val description: String?, val permissions: List<String>)

@Serializable
data class RoleUpdate(
    val version: Int,
    val name: String? = null,
    val description: String? = null,
    val permissions: List<String>? = null,
)

// ---------- settings ----------

@Immutable
@Serializable
data class TaxRate(val id: Int, val name: String, val ratePercent: BigDecimal, val isActive: Boolean, val sortOrder: Int)

@Serializable
data class TaxRateIn(val id: Int?, val name: String, val ratePercent: BigDecimal, val isActive: Boolean)

@Serializable
data class TaxRatesIn(val version: Int, val taxRates: List<TaxRateIn>)

@Immutable
@Serializable
data class RestaurantSettings(
    val restaurantName: String,
    val locationName: String,
    val address: String?,
    val timezone: String,
    val currencyCode: String,
    val serviceChargePercent: BigDecimal,
    val serviceChargeTaxable: Boolean,
    val roundingIncrement: BigDecimal,
    val billPrefix: String,
    val statusAfterPayment: TableStatus,
    val version: Int,
    val taxRates: List<TaxRate>,
    val paymentMethods: List<PaymentMethod>,
)

@Serializable
data class SettingsUpdate(
    val version: Int,
    val restaurantName: String? = null,
    val locationName: String? = null,
    val address: String? = null,
    val timezone: String? = null,
    val currencyCode: String? = null,
    val serviceChargePercent: BigDecimal? = null,
    val serviceChargeTaxable: Boolean? = null,
    val roundingIncrement: BigDecimal? = null,
    val billPrefix: String? = null,
    val statusAfterPayment: TableStatus? = null,
)

@Serializable
data class PaymentMethodIn(val name: String, val isCash: Boolean = false, val isActive: Boolean = true, val sortOrder: Int = 0)

@Serializable
data class PaymentMethodUpdate(val name: String? = null, val isCash: Boolean? = null, val isActive: Boolean? = null)

// ---------- insights ----------

@Immutable
@Serializable
data class TableCounts(val total: Int, val available: Int, val occupied: Int, val reserved: Int, val cleaning: Int, val blocked: Int)

@Immutable
@Serializable
data class KitchenCounts(val new: Int, val preparing: Int, val ready: Int, val oldestActiveFiredAt: Instant?)

@Immutable
@Serializable
data class SalesToday(val netSales: BigDecimal, val paidBills: Int, val averageBill: BigDecimal)

@Immutable
@Serializable
data class Activity(val id: Int, val action: String, val summary: String, val actorName: String?, val createdAt: Instant)

@Immutable
@Serializable
data class Dashboard(
    val serverTime: Instant,
    val businessDate: LocalDate,
    val currencyCode: String,
    val tables: TableCounts?,
    val kitchen: KitchenCounts?,
    val openOrders: Int?,
    val readyItems: Int?,
    val openBills: Int?,
    val openBillsAmount: BigDecimal?,
    val salesToday: SalesToday?,
    val recentActivity: List<Activity>?,
)

@Immutable
@Serializable
data class NamedAmount(val name: String, val count: Int, val amount: BigDecimal)

@Immutable
@Serializable
data class TopItem(val menuItemId: Int, val name: String, val quantity: Int, val revenue: BigDecimal)

@Immutable
@Serializable
data class TableUsage(val tableName: String, val orders: Int, val revenue: BigDecimal, val averageMinutes: Int)

@Immutable
@Serializable
data class DailySales(val date: LocalDate, val netSales: BigDecimal, val orders: Int)

@Immutable
@Serializable
data class HourlySales(val hour: Int, val netSales: BigDecimal, val orders: Int)

@Immutable
@Serializable
data class Report(
    val startDate: LocalDate,
    val endDate: LocalDate,
    val currencyCode: String,
    val grossSales: BigDecimal,
    val refunds: BigDecimal,
    val netSales: BigDecimal,
    val orderCount: Int,
    val averageOrderValue: BigDecimal,
    val guests: Int,
    val discountsTotal: BigDecimal,
    val discountedBills: Int,
    val taxTotal: BigDecimal,
    val serviceChargeTotal: BigDecimal,
    val cancelledOrders: Int,
    val voidedItemsValue: BigDecimal,
    val daily: List<DailySales>,
    val hourly: List<HourlySales>,
    val topItems: List<TopItem>,
    val paymentMethods: List<NamedAmount>,
    val tables: List<TableUsage>,
    val staff: List<NamedAmount>,
)

@Immutable
@Serializable
data class AuditEntry(
    val id: Int,
    val action: String,
    val entityType: String,
    val entityId: String?,
    val summary: String,
    val actorId: Int?,
    val actorName: String?,
    @SerialName("metadata") val metadata: JsonObject = JsonObject(emptyMap()),
    val createdAt: Instant,
)

@Immutable
@Serializable
data class AuditPage(val items: List<AuditEntry>, val nextBeforeId: Int?)
