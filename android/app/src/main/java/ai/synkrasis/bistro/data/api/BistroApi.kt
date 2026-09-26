package ai.synkrasis.bistro.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** The Bistro REST API (/api/v1). Every call is authorised server-side. */
interface BistroApi {
    // auth
    @POST("auth/login") suspend fun login(@Body body: LoginIn): TokenPair
    @POST("auth/logout") suspend fun logout()
    @GET("me") suspend fun me(): Me
    @POST("me/password") suspend fun changePassword(@Body body: ChangePasswordIn): TokenPair

    // floor
    @GET("tables") suspend fun floor(): Floor
    @POST("tables") suspend fun createTable(@Body body: TableIn): DiningTable
    @PATCH("tables/{id}") suspend fun updateTable(@Path("id") id: Int, @Body body: TableUpdate): DiningTable
    @DELETE("tables/{id}") suspend fun deleteTable(@Path("id") id: Int)
    @POST("tables/{id}/status") suspend fun setTableStatus(@Path("id") id: Int, @Body body: TableStatusIn): DiningTable
    @GET("table-areas") suspend fun areas(): List<Area>
    @POST("table-areas") suspend fun createArea(@Body body: AreaIn): Area
    @DELETE("table-areas/{id}") suspend fun deleteArea(@Path("id") id: Int)

    // menu
    @GET("menu") suspend fun menu(): Menu
    @POST("menu/categories") suspend fun createCategory(@Body body: CategoryIn): MenuCategory
    @PATCH("menu/categories/{id}") suspend fun updateCategory(@Path("id") id: Int, @Body body: CategoryIn): MenuCategory
    @DELETE("menu/categories/{id}") suspend fun deleteCategory(@Path("id") id: Int)
    @POST("menu/items") suspend fun createMenuItem(@Body body: MenuItemIn): MenuItem
    @PATCH("menu/items/{id}") suspend fun updateMenuItem(@Path("id") id: Int, @Body body: MenuItemUpdate): MenuItem
    @POST("menu/items/{id}/availability") suspend fun setAvailability(@Path("id") id: Int, @Body body: AvailabilityIn): MenuItem
    @DELETE("menu/items/{id}") suspend fun deleteMenuItem(@Path("id") id: Int)

    // orders
    @GET("orders") suspend fun orders(
        @Query("status") statuses: List<String>?,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
    ): Page<OrderSummary>
    @POST("orders") suspend fun openOrder(@Header("Idempotency-Key") key: String, @Body body: OrderCreate): Order
    @GET("orders/{id}") suspend fun order(@Path("id") id: Int): Order
    @PATCH("orders/{id}") suspend fun updateOrder(@Path("id") id: Int, @Body body: OrderUpdate): Order
    @POST("orders/{id}/items") suspend fun addItems(
        @Path("id") id: Int,
        @Header("Idempotency-Key") key: String,
        @Body body: AddItemsIn,
    ): Order
    @PATCH("orders/{id}/items/{itemId}") suspend fun updateItem(@Path("id") id: Int, @Path("itemId") itemId: Int, @Body body: ItemUpdate): Order
    @DELETE("orders/{id}/items/{itemId}") suspend fun removeItem(@Path("id") id: Int, @Path("itemId") itemId: Int): Order
    @POST("orders/{id}/items/{itemId}/void") suspend fun voidItem(@Path("id") id: Int, @Path("itemId") itemId: Int, @Body body: ReasonIn): Order
    @POST("orders/{id}/items/{itemId}/serve") suspend fun serveItem(@Path("id") id: Int, @Path("itemId") itemId: Int): Order
    @POST("orders/{id}/fire") suspend fun fire(@Path("id") id: Int, @Header("Idempotency-Key") key: String, @Body body: VersionIn): Order
    @POST("orders/{id}/cancel") suspend fun cancelOrder(@Path("id") id: Int, @Body body: CancelOrderIn): Order
    @POST("orders/{id}/transfer") suspend fun transfer(@Path("id") id: Int, @Body body: TransferIn): Order
    @POST("orders/{id}/merge") suspend fun merge(@Path("id") id: Int, @Body body: MergeIn): Order
    @POST("orders/{id}/split") suspend fun split(@Path("id") id: Int, @Body body: SplitIn): Order

    // kitchen
    @GET("kitchen/tickets") suspend fun kitchen(@Query("include_recent") includeRecent: Boolean = true): KitchenBoard
    @POST("kitchen/tickets/{id}/transition") suspend fun transitionTicket(@Path("id") id: Int, @Body body: TicketTransitionIn): Ticket

    // billing
    @GET("bills") suspend fun bills(
        @Query("status") statuses: List<String>?,
        @Query("paid_since") paidSince: String?,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
    ): Page<BillSummary>
    @POST("bills") suspend fun createBill(@Header("Idempotency-Key") key: String, @Body body: BillCreate): Bill
    @GET("bills/{id}") suspend fun bill(@Path("id") id: Int): Bill
    @POST("bills/{id}/discount") suspend fun discount(@Path("id") id: Int, @Body body: DiscountIn): Bill
    @POST("bills/{id}/void") suspend fun voidBill(@Path("id") id: Int, @Body body: VoidBillIn): Bill
    @POST("bills/{id}/payments") suspend fun pay(@Path("id") id: Int, @Header("Idempotency-Key") key: String, @Body body: PaymentIn): Bill
    @POST("bills/{id}/settle") suspend fun settleZero(@Path("id") id: Int, @Body body: VersionIn): Bill
    @POST("bills/{id}/refunds") suspend fun refund(@Path("id") id: Int, @Header("Idempotency-Key") key: String, @Body body: RefundIn): Bill
    @GET("payment-methods") suspend fun paymentMethods(): List<PaymentMethod>

    // staff & roles
    @GET("users") suspend fun users(@Query("include_inactive") includeInactive: Boolean, @Query("limit") limit: Int = 200): Page<StaffMember>
    @POST("users") suspend fun createUser(@Body body: UserCreate): StaffMember
    @PATCH("users/{id}") suspend fun updateUser(@Path("id") id: Int, @Body body: UserUpdate): StaffMember
    @POST("users/{id}/deactivate") suspend fun deactivateUser(@Path("id") id: Int, @Body body: VersionIn): StaffMember
    @POST("users/{id}/reactivate") suspend fun reactivateUser(@Path("id") id: Int, @Body body: VersionIn): StaffMember
    @POST("users/{id}/password") suspend fun resetPassword(@Path("id") id: Int, @Body body: ResetPasswordIn): StaffMember
    @GET("roles") suspend fun roles(): List<Role>
    @GET("permissions") suspend fun permissions(): List<PermissionInfo>
    @POST("roles") suspend fun createRole(@Body body: RoleCreate): Role
    @PATCH("roles/{id}") suspend fun updateRole(@Path("id") id: Int, @Body body: RoleUpdate): Role
    @DELETE("roles/{id}") suspend fun deleteRole(@Path("id") id: Int)

    // settings
    @GET("settings") suspend fun settings(): RestaurantSettings
    @PATCH("settings") suspend fun updateSettings(@Body body: SettingsUpdate): RestaurantSettings
    @PUT("settings/tax-rates") suspend fun replaceTaxRates(@Body body: TaxRatesIn): RestaurantSettings
    @POST("payment-methods") suspend fun createPaymentMethod(@Body body: PaymentMethodIn): PaymentMethod
    @PATCH("payment-methods/{id}") suspend fun updatePaymentMethod(@Path("id") id: Int, @Body body: PaymentMethodUpdate): PaymentMethod

    // insights
    @GET("dashboard") suspend fun dashboard(): Dashboard
    @GET("reports/summary") suspend fun report(@Query("start") start: String, @Query("end") end: String): Report
    @GET("audit-logs") suspend fun auditLogs(
        @Query("before_id") beforeId: Int?,
        @Query("action") action: String?,
        @Query("limit") limit: Int = 50,
    ): AuditPage
}
