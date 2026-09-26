package ai.synkrasis.bistro.navigation

import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.data.api.Me
import ai.synkrasis.bistro.domain.Grants
import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.toRoute
import java.time.ZoneId

/** What feature screens may do with navigation. Keeps NavController out of features. */
@Stable
class Navigator(private val nav: NavHostController) {
    /**
     * Push a screen. Argument-less routes are single-top; routes with arguments (an order, a
     * bill) always push, so moving from one order to another keeps the first on the stack.
     */
    fun open(route: Any) {
        nav.navigate(route) { launchSingleTop = isSingleTop(route) }
    }

    /** Go to an order: pop back to it if it's the screen underneath, otherwise push it. */
    fun openOrder(orderId: Int) {
        val previous = nav.previousBackStackEntry
        if (previous != null && previous.destination.hasRoute(OrderRoute::class) &&
            previous.toRoute<OrderRoute>().orderId == orderId
        ) {
            nav.popBackStack()
        } else {
            open(OrderRoute(orderId))
        }
    }

    /** Pops only while there is something underneath: a double tap can't empty the stack. */
    fun back() {
        if (nav.previousBackStackEntry != null) nav.popBackStack()
    }

    /** Switch bottom-bar tab (restores that tab's state), used by shortcuts like Home tiles. */
    var selectTab: (TopLevel) -> Unit = { open(it.route) }
}

/**
 * Argument-less routes are single-top; routes with arguments always push. Decided without
 * reflection: kotlin-reflect isn't shipped, and reflective KClass lookups throw without it.
 */
fun isSingleTop(route: Any): Boolean =
    route !is OrderRoute && route !is BillRoute && route !is AddItemsRoute && route !is RoleEditRoute

/** The signed-in user, available to every screen for permission checks and formatting. */
@Stable
class SessionInfo(val me: Me, val grants: Grants) {
    val currency: String get() = me.location.currencyCode
    val zone: ZoneId = runCatching { ZoneId.of(me.location.timezone) }.getOrDefault(ZoneId.systemDefault())

    fun can(permission: String) = grants.has(permission)

    companion object {
        fun of(state: SessionState.SignedIn) = SessionInfo(state.me, state.grants)
    }
}

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("No navigator") }
val LocalSession = staticCompositionLocalOf<SessionInfo> { error("No session") }
