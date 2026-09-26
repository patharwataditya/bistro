package ai.synkrasis.bistro.navigation

import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.data.api.Me
import ai.synkrasis.bistro.domain.Grants
import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import java.time.ZoneId

/** What feature screens may do with navigation. Keeps NavController out of features. */
@Stable
class Navigator(private val nav: NavHostController) {
    fun open(route: Any) = nav.navigate(route) { launchSingleTop = true }

    /** Replace the current screen (e.g. after opening an order, go straight to it). */
    fun replace(route: Any) {
        val current = nav.currentDestination?.id
        nav.navigate(route) {
            if (current != null) popUpTo(current) { inclusive = true }
            launchSingleTop = true
        }
    }

    fun back() {
        if (!nav.popBackStack()) Unit
    }
}

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
