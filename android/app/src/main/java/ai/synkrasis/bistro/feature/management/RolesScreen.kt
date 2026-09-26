package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.SkeletonList
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.Role
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.NEW
import ai.synkrasis.bistro.navigation.RoleEditRoute
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class RolesViewModel(private val container: AppContainer) : ActionViewModel() {
    var state by mutableStateOf<LoadState<List<Role>>>(LoadState.Loading)
        private set
    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        state = state.reduce(container.staff.roles())
    }
}

@Composable
fun RolesScreen() {
    val vm = bistroViewModel(key = "roles") { RolesViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    // Also refreshes on returning from the editor (polling restarts when the screen is visible).
    PollWhileVisible(60_000) { vm.refresh() }
    val canCreate = session.can(Permission.ROLES_CREATE)
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Roles",
            subtitle = "What each job can see and do",
            onBack = navigator::back,
            actions = {
                if (canCreate) BistroIconButton(Icons.Rounded.Add, "New role", { navigator.open(RoleEditRoute(NEW)) })
            },
        )
        when (val s = vm.state) {
            LoadState.Loading -> SkeletonList(rows = 6, rowHeight = 76.dp)
            is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
            is LoadState.Ready -> LazyColumn(
                contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = Spacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                modifier = Modifier.fillMaxSize(),
            ) {
                item(key = "stale") { StaleBanner(s.staleError) }
                if (s.data.isEmpty()) {
                    item(key = "empty") {
                        EmptyState(
                            Icons.Rounded.AdminPanelSettings, "No roles yet",
                            if (canCreate) "Create a role for each job, then give it to your staff." else "Roles will appear here once a manager creates them.",
                            action = if (canCreate) {
                                { BistroButton("New role", { navigator.open(RoleEditRoute(NEW)) }, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary) }
                            } else {
                                null
                            },
                        )
                    }
                }
                items(s.data, key = { it.id }) { role ->
                    RoleCard(role, Modifier.fillMaxWidth().itemMotion(this)) { navigator.open(RoleEditRoute(role.id)) }
                }
            }
        }
    }
}

@Composable
private fun RoleCard(role: Role, modifier: Modifier, onClick: () -> Unit) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    BistroCard(
        modifier,
        onClick = {
            haptics.perform(Haptic.Selection)
            onClick()
        },
        onClickLabel = if (role.editable) "Edit ${role.name}" else "View ${role.name}",
        elevated = false,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(
                role.name, style = BistroTheme.type.cardTitle, color = c.textPrimary,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            )
            if (role.isSystem) StatusChip("Built-in", Tone.Info, icon = Icons.Rounded.Verified)
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                if (!role.editable) Icon(Icons.Rounded.Lock, "You can't edit this role", tint = c.textTertiary, modifier = Modifier.size(18.dp))
            }
        }
        role.description?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = BistroTheme.type.supporting, color = c.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(
            "${role.memberCount} ${if (role.memberCount == 1) "member" else "members"} · " +
                "${role.permissions.size} ${if (role.permissions.size == 1) "permission" else "permissions"}",
            style = BistroTheme.type.metadata, color = c.textTertiary,
        )
    }
}
