package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.ToggleRow
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.RoleSummary
import ai.synkrasis.bistro.data.api.StaffMember
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant

@Composable
fun StaffScreen() {
    val session = LocalSession.current
    val vm = bistroViewModel(key = "staff") { StaffViewModel(it, session.can(Permission.ROLES_VIEW)) }
    val navigator = LocalNavigator.current
    val haptics = LocalHaptics.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    PollWhileVisible(60_000) { vm.refresh() }

    val data = vm.state.dataOrNull
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Staff",
            eyebrow = session.me.restaurantName,
            subtitle = data?.let { d ->
                val active = d.members.count { it.isActive }
                "$active active ${if (active == 1) "person" else "people"}"
            },
            onBack = navigator::back,
            actions = {
                if (session.can(Permission.STAFF_CREATE)) {
                    BistroIconButton(Icons.Rounded.PersonAdd, "Add staff", {
                        haptics.perform(Haptic.Selection)
                        vm.openCreate()
                    })
                }
            },
        )
        when (val s = vm.state) {
            LoadState.Loading -> StaffSkeleton()
            is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
            is LoadState.Ready -> StaffList(s.data, s.staleError, vm)
        }
    }

    StaffSheets(vm, data)
}

@Composable
private fun StaffList(data: StaffData, staleError: AppError?, vm: StaffViewModel) {
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    val visible = vm.visible(data)
    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        item(key = "search") {
            SearchField(vm.query, { vm.query = it.take(60) }, "Name, username or role", Modifier.fillMaxWidth())
        }
        item(key = "inactive") {
            ToggleRow(
                title = "Show deactivated",
                subtitle = "People who can no longer sign in",
                checked = vm.showInactive,
                onCheckedChange = vm::toggleInactive,
            )
        }
        if (visible.isEmpty()) {
            item(key = "empty") {
                val searching = vm.query.isNotBlank()
                EmptyState(
                    icon = if (searching) Icons.Rounded.SearchOff else Icons.Rounded.Groups,
                    title = if (searching) "No one matches \"${vm.query.trim()}\"" else "No staff yet",
                    message = when {
                        searching -> "Check the spelling, or search by username or role."
                        session.can(Permission.STAFF_CREATE) -> "Add your team so everyone signs in with their own account."
                        else -> "Staff accounts will appear here once a manager adds them."
                    },
                    action = if (!searching && session.can(Permission.STAFF_CREATE)) {
                        { BistroButton("Add staff", vm::openCreate, icon = Icons.Rounded.PersonAdd, style = ButtonStyle.Secondary) }
                    } else {
                        null
                    },
                )
            }
        }
        items(visible, key = { it.id }) { member ->
            StaffCard(
                member = member,
                isMe = member.id == session.me.id,
                onClick = {
                    haptics.perform(Haptic.Selection)
                    vm.selectedId = member.id
                },
                modifier = Modifier.itemMotion(this),
            )
        }
    }
}

@Composable
private fun StaffCard(member: StaffMember, isMe: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    BistroCard(modifier.fillMaxWidth(), onClick = onClick, onClickLabel = "Manage ${member.fullName}", elevated = false) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Avatar(member.fullName, muted = !member.isActive)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(
                        member.fullName + if (isMe) " (you)" else "",
                        style = BistroTheme.type.cardTitle, color = if (member.isActive) c.textPrimary else c.textSecondary,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                    )
                    if (!member.isActive) StatusChip("Inactive", Tone.Neutral, icon = Icons.Rounded.PersonOff)
                }
                Text("@${member.username}", style = BistroTheme.type.identifier, color = c.textSecondary)
                if (member.roles.isNotEmpty()) RolePills(member.roles)
                Text(
                    lastSignIn(member.lastLoginAt, session.zone),
                    style = BistroTheme.type.metadata, color = c.textTertiary,
                )
            }
        }
    }
}

fun lastSignIn(at: Instant?, zone: java.time.ZoneId): String =
    at?.let { "Last sign-in · ${Format.relative(it, Instant.now(), zone)}" } ?: "Never signed in"

@Composable
fun RolePills(roles: List<RoleSummary>, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    FlowRow(
        modifier.padding(vertical = Spacing.xxs).clearAndSetSemantics { contentDescription = "Roles: " + roles.joinToString { it.name } },
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
        verticalArrangement = Arrangement.spacedBy(Spacing.xs),
    ) {
        roles.forEach { role ->
            Row(
                Modifier.clip(Radii.pill).background(c.surfaceSunken).padding(horizontal = Spacing.sm, vertical = Spacing.xxs),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            ) {
                androidx.compose.foundation.layout.Box(Modifier.size(6.dp).clip(CircleShape).background(c.accent))
                Text(role.name, style = BistroTheme.type.metadata, color = c.textPrimary, maxLines = 1)
            }
        }
    }
}

@Composable
private fun StaffSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 56.dp)
        Skeleton(Modifier.fillMaxWidth(0.6f), 24.dp)
        repeat(5) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Skeleton(Modifier.size(44.dp), 44.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Skeleton(Modifier.fillMaxWidth(0.7f), 18.dp)
                    Skeleton(Modifier.fillMaxWidth(0.4f), 14.dp)
                    Skeleton(Modifier.fillMaxWidth(0.5f), 14.dp)
                }
            }
        }
    }
}
