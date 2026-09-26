package ai.synkrasis.bistro.navigation

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.MessageToast
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.core.ui.LocalMessenger
import ai.synkrasis.bistro.core.ui.Messenger
import ai.synkrasis.bistro.feature.billing.BillScreen
import ai.synkrasis.bistro.feature.billing.BillsScreen
import ai.synkrasis.bistro.feature.dashboard.HomeScreen
import ai.synkrasis.bistro.feature.floor.FloorScreen
import ai.synkrasis.bistro.feature.floor.TablesManageScreen
import ai.synkrasis.bistro.feature.kitchen.KitchenScreen
import ai.synkrasis.bistro.feature.management.AuditScreen
import ai.synkrasis.bistro.feature.management.RoleEditScreen
import ai.synkrasis.bistro.feature.management.RolesScreen
import ai.synkrasis.bistro.feature.management.SettingsScreen
import ai.synkrasis.bistro.feature.management.StaffScreen
import ai.synkrasis.bistro.feature.menu.MenuManageScreen
import ai.synkrasis.bistro.feature.more.MoreScreen
import ai.synkrasis.bistro.feature.order.AddItemsScreen
import ai.synkrasis.bistro.feature.order.OrderScreen
import ai.synkrasis.bistro.feature.order.OrdersScreen
import ai.synkrasis.bistro.feature.reports.ReportsScreen
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute

@Composable
fun MainShell(container: AppContainer, state: SessionState.SignedIn) {
    val session = remember(state) { SessionInfo.of(state) }
    val tabs = remember(session) { TopLevel.visibleFor(session.grants) }
    val nav = rememberNavController()
    val navigator = remember(nav) { Navigator(nav) }
    val messenger = remember { Messenger() }
    val haptics = LocalHaptics.current
    val wide = LocalConfiguration.current.screenWidthDp >= 600
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val onTopLevel = tabs.any { tab -> destination?.hierarchy?.any { it.hasRoute(tab.route::class) } == true }
    val c = BistroTheme.colors

    LaunchedEffect(messenger.current) { messenger.autoDismiss() }
    // Permissions can change while signed in; re-read the profile when the app is opened.
    LaunchedEffect(Unit) { runCatching { container.session.reloadProfile() } }

    fun selectTab(tab: TopLevel) {
        haptics.perform(Haptic.Selection)
        nav.navigate(tab.route) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    CompositionLocalProvider(
        LocalNavigator provides navigator,
        LocalSession provides session,
        LocalMessenger provides messenger,
    ) {
        Box(Modifier.fillMaxSize().background(c.background)) {
            Row(Modifier.fillMaxSize()) {
                if (wide && onTopLevel) {
                    NavigationRail(containerColor = c.surface, modifier = Modifier.fillMaxHeight()) {
                        Column(Modifier.fillMaxHeight(), verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                            tabs.forEach { tab ->
                                val selected = destination?.hierarchy?.any { it.hasRoute(tab.route::class) } == true
                                NavigationRailItem(
                                    selected = selected,
                                    onClick = { selectTab(tab) },
                                    icon = { Icon(tab.icon, null) },
                                    label = { Text(tab.label, style = BistroTheme.type.metadata) },
                                    colors = NavigationRailItemDefaults.colors(
                                        selectedIconColor = c.onInk, indicatorColor = c.ink,
                                        selectedTextColor = c.textPrimary, unselectedIconColor = c.textTertiary,
                                        unselectedTextColor = c.textTertiary,
                                    ),
                                )
                            }
                        }
                    }
                }
                Column(Modifier.weight(1f).fillMaxHeight()) {
                    Box(Modifier.weight(1f)) {
                        NavHost(
                            navController = nav,
                            startDestination = tabs.first().route,
                            enterTransition = { enterFor(this) },
                            exitTransition = { exitFor(this) },
                            popEnterTransition = { popEnterFor(this) },
                            popExitTransition = { popExitFor(this) },
                        ) {
                            composable<HomeRoute> { HomeScreen() }
                            composable<FloorRoute> { FloorScreen() }
                            composable<KitchenRoute> { KitchenScreen() }
                            composable<BillsRoute> { BillsScreen() }
                            composable<MoreRoute> { MoreScreen() }
                            composable<OrderRoute> { OrderScreen(it.toRoute<OrderRoute>().orderId) }
                            composable<AddItemsRoute> { AddItemsScreen(it.toRoute<AddItemsRoute>().orderId) }
                            composable<BillRoute> { BillScreen(it.toRoute<BillRoute>().billId) }
                            composable<OrdersRoute> { OrdersScreen() }
                            composable<MenuManageRoute> { MenuManageScreen() }
                            composable<TablesManageRoute> { TablesManageScreen() }
                            composable<ReportsRoute> { ReportsScreen() }
                            composable<StaffRoute> { StaffScreen() }
                            composable<RolesRoute> { RolesScreen() }
                            composable<RoleEditRoute> { RoleEditScreen(it.toRoute<RoleEditRoute>().roleId) }
                            composable<SettingsRoute> { SettingsScreen() }
                            composable<AuditRoute> { AuditScreen() }
                        }
                    }
                    if (!wide && onTopLevel && tabs.size > 1) {
                        NavigationBar(containerColor = c.surface, tonalElevation = 0.dp) {
                            tabs.forEach { tab ->
                                val selected = destination?.hierarchy?.any { it.hasRoute(tab.route::class) } == true
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { selectTab(tab) },
                                    icon = { Icon(tab.icon, null) },
                                    label = { Text(tab.label, style = BistroTheme.type.metadata) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = c.onInk, indicatorColor = c.ink,
                                        selectedTextColor = c.textPrimary, unselectedIconColor = c.textTertiary,
                                        unselectedTextColor = c.textTertiary,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
            MessageToast(
                messenger.current,
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding()
                    .padding(bottom = if (!wide && onTopLevel) 80.dp else 16.dp),
            )
        }
    }
}

private fun isTopLevel(entry: NavBackStackEntry): Boolean =
    TopLevel.entries.any { entry.destination.hasRoute(it.route::class) }

/** Tabs fade through; pushed screens slide in on the X axis (shared-axis pattern). */
private fun enterFor(scope: AnimatedContentTransitionScope<NavBackStackEntry>): EnterTransition =
    if (isTopLevel(scope.targetState) && isTopLevel(scope.initialState)) {
        fadeIn(Motion.enter()) + scaleIn(Motion.enter(), initialScale = 0.985f)
    } else {
        slideInHorizontally(Motion.enter()) { it / 5 } + fadeIn(Motion.enter())
    }

private fun exitFor(scope: AnimatedContentTransitionScope<NavBackStackEntry>): ExitTransition =
    if (isTopLevel(scope.targetState) && isTopLevel(scope.initialState)) {
        fadeOut(Motion.exit())
    } else {
        slideOutHorizontally(Motion.exit()) { -it / 10 } + fadeOut(Motion.exit())
    }

private fun popEnterFor(scope: AnimatedContentTransitionScope<NavBackStackEntry>): EnterTransition =
    slideInHorizontally(Motion.enter()) { -it / 10 } + fadeIn(Motion.enter())

private fun popExitFor(scope: AnimatedContentTransitionScope<NavBackStackEntry>): ExitTransition =
    slideOutHorizontally(Motion.exit()) { it / 5 } + fadeOut(Motion.exit())

