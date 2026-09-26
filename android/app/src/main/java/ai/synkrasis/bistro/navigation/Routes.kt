package ai.synkrasis.bistro.navigation

import ai.synkrasis.bistro.domain.Grants
import ai.synkrasis.bistro.domain.Permission
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Restaurant
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.ui.graphics.vector.ImageVector
import kotlinx.serialization.Serializable

@Serializable data object HomeRoute
@Serializable data object FloorRoute
@Serializable data object KitchenRoute
@Serializable data object BillsRoute
@Serializable data object MoreRoute

@Serializable data class OrderRoute(val orderId: Int)
@Serializable data class AddItemsRoute(val orderId: Int)
@Serializable data class BillRoute(val billId: Int)
@Serializable data object OrdersRoute
@Serializable data object MenuManageRoute
@Serializable data object TablesManageRoute
@Serializable data object ReportsRoute
@Serializable data object StaffRoute
@Serializable data object RolesRoute
@Serializable data class RoleEditRoute(val roleId: Int = NEW)
@Serializable data object SettingsRoute
@Serializable data object AuditRoute

const val NEW = -1

/** Top-level destinations. Which appear is decided by the caller's permissions. */
enum class TopLevel(val route: Any, val label: String, val icon: ImageVector, val permission: String?) {
    Home(HomeRoute, "Home", Icons.Rounded.Dashboard, Permission.DASHBOARD_VIEW),
    Floor(FloorRoute, "Floor", Icons.Rounded.TableRestaurant, Permission.TABLES_VIEW),
    Kitchen(KitchenRoute, "Kitchen", Icons.Rounded.Restaurant, Permission.KITCHEN_VIEW),
    Bills(BillsRoute, "Bills", Icons.Rounded.ReceiptLong, Permission.BILLING_VIEW),
    More(MoreRoute, "More", Icons.Rounded.MoreHoriz, null);

    companion object {
        fun visibleFor(grants: Grants): List<TopLevel> =
            entries.filter { it.permission == null || grants.has(it.permission) }
    }
}
