package ai.synkrasis.bistro.feature.more

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.ToggleRow
import ai.synkrasis.bistro.core.designsystem.theme.Appearance
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.designsystem.theme.colorsFor
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.ui.appContainer
import ai.synkrasis.bistro.core.ui.LocalMessenger
import ai.synkrasis.bistro.core.designsystem.component.UiMessage
import ai.synkrasis.bistro.core.designsystem.component.MessageKind
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.AuditRoute
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.MenuManageRoute
import ai.synkrasis.bistro.navigation.OrdersRoute
import ai.synkrasis.bistro.navigation.ReportsRoute
import ai.synkrasis.bistro.navigation.RolesRoute
import ai.synkrasis.bistro.navigation.SettingsRoute
import ai.synkrasis.bistro.navigation.StaffRoute
import ai.synkrasis.bistro.navigation.TablesManageRoute
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.MenuBook
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

private data class Link(val icon: ImageVector, val title: String, val subtitle: String, val route: Any, val permission: String)

private val LINKS = listOf(
    Link(Icons.Rounded.ReceiptLong, "Orders", "Active, closed and cancelled checks", OrdersRoute, Permission.ORDERS_VIEW),
    Link(Icons.Rounded.MenuBook, "Menu", "Items, prices, availability", MenuManageRoute, Permission.MENU_VIEW),
    Link(Icons.Rounded.TableRestaurant, "Tables & areas", "Floor layout", TablesManageRoute, Permission.TABLES_UPDATE),
    Link(Icons.Rounded.Insights, "Reports", "Sales and operations", ReportsRoute, Permission.REPORTS_VIEW),
    Link(Icons.Rounded.Groups, "Staff", "Accounts and access", StaffRoute, Permission.STAFF_VIEW),
    Link(Icons.Rounded.AdminPanelSettings, "Roles & permissions", "What each role can do", RolesRoute, Permission.ROLES_VIEW),
    Link(Icons.Rounded.Settings, "Restaurant settings", "Taxes, billing, payment methods", SettingsRoute, Permission.SETTINGS_VIEW),
    Link(Icons.Rounded.History, "Audit log", "Who did what, when", AuditRoute, Permission.AUDIT_LOGS_VIEW),
)

@Composable
fun MoreScreen() {
    val container = appContainer()
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    val appearance by container.preferences.appearance.collectAsStateWithLifecycle()
    val haptics by container.preferences.hapticsEnabled.collectAsStateWithLifecycle()
    var confirmSignOut by rememberSaveable { mutableStateOf(false) }
    var changePassword by rememberSaveable { mutableStateOf(false) }
    val c = BistroTheme.colors
    val links = LINKS.filter { session.can(it.permission) }

    Column(Modifier.fillMaxSize()) {
        BistroTopBar("More")
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.gutter).padding(bottom = Spacing.xxxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
        ) {
            ProfileCard()
            if (links.isNotEmpty()) {
                BistroCard(Modifier.fillMaxWidth(), elevated = false, contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = Spacing.xs)) {
                    links.forEachIndexed { i, link ->
                        LinkRow(link) { navigator.open(link.route) }
                        if (i != links.lastIndex) HairlineDivider(Modifier.padding(start = 64.dp))
                    }
                }
            }
            SectionHeader("Appearance", subtitle = "Applies to this device")
            AppearancePicker(appearance ?: Appearance.Default) { scope.launch { container.preferences.setAppearance(it) } }
            BistroCard(Modifier.fillMaxWidth(), elevated = false, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = Spacing.md)) {
                ToggleRow("Haptic feedback", haptics, { scope.launch { container.preferences.setHaptics(it) } },
                    subtitle = "Subtle vibrations for confirmations and alerts")
            }
            SectionHeader("Account")
            BistroCard(Modifier.fillMaxWidth(), elevated = false, contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = Spacing.xs)) {
                LinkRow(Link(Icons.Rounded.Key, "Change password", "Signs out your other devices", Unit, "")) { changePassword = true }
                HairlineDivider(Modifier.padding(start = 64.dp))
                LinkRow(Link(Icons.AutoMirrored.Rounded.Logout, "Sign out", session.me.username, Unit, ""), danger = true) { confirmSignOut = true }
            }
            Text(
                "Bistro ${ai.synkrasis.bistro.BuildConfig.VERSION_NAME}",
                style = BistroTheme.type.metadata, color = c.textTertiary,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }

    if (confirmSignOut) {
        ConfirmDialog(
            title = "Sign out?", message = "You'll need your password to sign back in on this device.",
            confirmLabel = "Sign out", destructive = true,
            onConfirm = { confirmSignOut = false; scope.launch { container.session.signOut() } },
            onDismiss = { confirmSignOut = false },
        )
    }
    if (changePassword) ChangePasswordSheet { changePassword = false }
}

@Composable
private fun ProfileCard() {
    val session = LocalSession.current
    val c = BistroTheme.colors
    val initials = session.me.fullName.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    BistroCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(56.dp).clip(Radii.pill).background(c.accentSoft), contentAlignment = Alignment.Center) {
                Text(initials, style = BistroTheme.type.sectionTitle, color = c.accent)
            }
            Column(Modifier.padding(start = Spacing.lg)) {
                Text(session.me.fullName, style = BistroTheme.type.cardTitle, color = c.textPrimary)
                Text("@${session.me.username} · ${session.me.roles.joinToString { it.name }}", style = BistroTheme.type.supporting, color = c.textSecondary)
                Text(session.me.location.name, style = BistroTheme.type.metadata, color = c.textTertiary)
            }
        }
    }
}

@Composable
private fun LinkRow(link: Link, danger: Boolean = false, onClick: () -> Unit) {
    val c = BistroTheme.colors
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(Radii.sm).background(if (danger) c.dangerSoft else c.surfaceSunken), contentAlignment = Alignment.Center) {
            Icon(link.icon, null, tint = if (danger) c.danger else c.textPrimary, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f).padding(start = Spacing.md)) {
            Text(link.title, style = BistroTheme.type.bodyStrong, color = if (danger) c.danger else c.textPrimary)
            Text(link.subtitle, style = BistroTheme.type.metadata, color = c.textSecondary)
        }
        if (!danger) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = c.textTertiary)
    }
}

/** Three hand-tuned palettes shown as miniature previews, not a system/auto option. */
@Composable
private fun AppearancePicker(selected: Appearance, onSelect: (Appearance) -> Unit) {
    val haptics = LocalHaptics.current
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Appearance.entries.forEach { mode ->
            val preview = colorsFor(mode)
            val isSelected = mode == selected
            val border by animateColorAsState(if (isSelected) BistroTheme.colors.accent else BistroTheme.colors.border, Motion.fast(), label = "ap")
            Column(
                Modifier.weight(1f).clip(Radii.lg).border(if (isSelected) 2.dp else 1.dp, border, Radii.lg)
                    .selectable(isSelected, role = Role.RadioButton) {
                        if (!isSelected) {
                            haptics.perform(Haptic.Selection)
                            onSelect(mode)
                        }
                    }
                    .padding(Spacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Column(
                    Modifier.fillMaxWidth().height(84.dp).clip(Radii.md).background(preview.background)
                        .border(1.dp, preview.border, Radii.md).padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(Modifier.fillMaxWidth(0.6f).height(8.dp).clip(Radii.pill).background(preview.textPrimary))
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.weight(1f).height(30.dp).clip(Radii.xs).background(preview.surface).border(1.dp, preview.border, Radii.xs))
                        Box(Modifier.weight(1f).height(30.dp).clip(Radii.xs).background(preview.surface).border(1.dp, preview.border, Radii.xs))
                    }
                    Box(Modifier.fillMaxWidth(0.4f).height(8.dp).clip(Radii.pill).background(preview.accent))
                }
                Gap(Spacing.sm)
                Text(mode.label, style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary)
            }
        }
    }

}

@Composable
private fun ChangePasswordSheet(onDone: () -> Unit) {
    val container = appContainer()
    val messenger = LocalMessenger.current
    val haptics = LocalHaptics.current
    val scope = rememberCoroutineScope()
    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    val strongEnough = next.length >= 8 && next.any { it.isLetter() } && next.any { !it.isLetter() }
    val mismatch = confirm.isNotEmpty() && confirm != next
    BistroSheet(
        title = "Change password",
        subtitle = "Other devices will be signed out.",
        onDismiss = { if (!busy) onDone() },
        actions = {
            BistroButton(
                "Update password",
                {
                    busy = true
                    error = null
                    scope.launch {
                        when (val r = container.account.changePassword(current, next)) {
                            is ApiResult.Success -> {
                                haptics.perform(Haptic.Success)
                                messenger.show(UiMessage("Password updated", MessageKind.Success))
                                onDone()
                            }
                            is ApiResult.Failure -> {
                                haptics.perform(Haptic.Reject)
                                error = r.error.message
                            }
                        }
                        busy = false
                    }
                },
                Modifier.fillMaxWidth(), size = ButtonSize.Large, loading = busy,
                enabled = current.isNotEmpty() && strongEnough && !mismatch && confirm == next,
            )
        },
    ) {
        BistroTextField(current, { current = it.take(128) }, "Current password", Modifier.fillMaxWidth(), password = true, error = error)
        Gap(Spacing.sm)
        BistroTextField(next, { next = it.take(128) }, "New password", Modifier.fillMaxWidth(), password = true,
            supporting = "At least 8 characters, mixing letters with numbers or symbols",
            error = if (next.isNotEmpty() && !strongEnough) "Too weak" else null)
        Gap(Spacing.sm)
        BistroTextField(confirm, { confirm = it.take(128) }, "Confirm new password", Modifier.fillMaxWidth(), password = true,
            error = if (mismatch) "Doesn't match" else null)
        Gap(Spacing.sm)
    }
}

