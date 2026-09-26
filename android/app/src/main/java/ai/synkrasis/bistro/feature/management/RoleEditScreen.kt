package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.data.api.PermissionInfo
import ai.synkrasis.bistro.data.api.Role
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.SessionInfo
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TriStateCheckbox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp

@Composable
fun RoleEditScreen(roleId: Int) {
    val vm = bistroViewModel(key = "role-$roleId") { RoleEditViewModel(it, roleId) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    val guardedBack = rememberGuardedBack(vm.dirty, navigator::back)
    LaunchedEffect(vm) { vm.refresh() }

    val data = vm.state.dataOrNull
    val role = data?.role
    val readOnly = if (data == null) null else readOnlyReason(vm.isNew, role, session)
    val canDelete = role != null && readOnly == null && session.can(Permission.ROLES_DELETE)

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BistroTopBar(
                title = if (vm.isNew) "New role" else role?.name ?: "Role",
                eyebrow = "Roles",
                subtitle = role?.let { "${it.memberCount} ${if (it.memberCount == 1) "member" else "members"}" }
                    ?: if (vm.isNew) "Choose what this job can do" else null,
                onBack = guardedBack,
                actions = {
                    if (canDelete) {
                        BistroIconButton(Icons.Rounded.DeleteOutline, "Delete role", { vm.confirmDelete = true }, tint = BistroTheme.colors.danger)
                    }
                },
            )
            when (val s = vm.state) {
                LoadState.Loading -> RoleEditSkeleton()
                is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
                is LoadState.Ready -> RoleEditBody(s.data, s.staleError, readOnly, vm)
            }
        }
        StickySaveBar(
            visible = vm.dirty && readOnly == null && data != null,
            loading = vm.working == "save",
            onSave = vm::save,
            onDiscard = vm::discard,
            label = if (vm.isNew) "Create role" else "Save",
            enabled = vm.form.name.isNotBlank(),
            message = "${vm.form.permissions.size} permissions",
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    if (vm.confirmDelete && role != null) {
        ConfirmDialog(
            title = "Delete ${role.name}?",
            message = if (role.memberCount > 0) {
                "${role.memberCount} ${if (role.memberCount == 1) "person has" else "people have"} this role. Move them to another role first, or the delete will be refused."
            } else {
                "The role is removed for good. This is recorded in the audit log."
            },
            confirmLabel = "Delete role",
            destructive = true,
            loading = vm.working == "delete",
            onConfirm = vm::delete,
            onDismiss = { vm.confirmDelete = false },
        )
    }
}

/** Mirrors the server's edit rules, so a read-only role always says why. */
private fun readOnlyReason(isNew: Boolean, role: Role?, session: SessionInfo): String? = when {
    isNew -> if (session.can(Permission.ROLES_CREATE)) null else "You can't create roles. Ask a manager."
    role == null -> null
    role.isSystem -> "${role.name} is built in and can't be changed. It always has every permission."
    !session.can(Permission.ROLES_UPDATE) -> "You can view this role but not change it."
    session.me.roles.any { it.id == role.id } -> "You can't edit a role you hold. Ask another manager."
    !role.permissions.all { session.grants.has(it) } -> "This role includes access you don't have, so you can't edit it."
    !role.editable -> "Someone with this role has access you don't have, so you can't edit it."
    else -> null
}

@Composable
private fun RoleEditBody(data: RoleEditData, staleError: AppError?, readOnly: String?, vm: RoleEditViewModel) {
    val session = LocalSession.current
    val editable = readOnly == null
    val groups = remember(data.permissions) { data.permissions.groupBy { it.group }.toList() }
    val form = vm.form
    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = 120.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        if (readOnly != null) {
            item(key = "readonly") {
                NoticeCard(readOnly, icon = Icons.Rounded.Lock, tone = Tone.Info, modifier = Modifier.padding(bottom = Spacing.md))
            }
        }
        item(key = "fields") {
            Column {
                BistroTextField(
                    form.name, { v -> vm.edit { it.copy(name = v.take(60)) } }, "Role name", Modifier.fillMaxWidth(),
                    enabled = editable, error = vm.errors["name"],
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                )
                Gap(Spacing.sm)
                BistroTextField(
                    form.description, { v -> vm.edit { it.copy(description = v.take(200)) } }, "Description (optional)",
                    Modifier.fillMaxWidth(), enabled = editable, singleLine = false, minLines = 2,
                    error = vm.errors["description"],
                    placeholder = "e.g. Takes orders and serves tables",
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                if (editable && data.permissions.any { !session.grants.has(it.code) }) {
                    Gap(Spacing.md)
                    NoticeCard("Locked permissions are ones you don't hold. You can't grant access you don't have.", icon = Icons.Rounded.Lock)
                }
            }
        }
        groups.forEach { (group, perms) ->
            item(key = "g-$group") {
                GroupHeader(group, perms, form.permissions, editable) { codes, on ->
                    vm.edit { it.copy(permissions = if (on) it.permissions + codes else it.permissions - codes) }
                }
            }
            items(perms, key = { it.code }) { perm ->
                val grantable = session.grants.has(perm.code)
                CheckRow(
                    title = perm.code.substringAfter('.').humanize(),
                    subtitle = perm.description,
                    note = if (editable && !grantable) "You can't grant access you don't have" else null,
                    checked = perm.code in form.permissions,
                    enabled = editable && grantable,
                    onToggle = { on -> vm.edit { it.copy(permissions = if (on) it.permissions + perm.code else it.permissions - perm.code) } },
                )
            }
        }
    }
}

/** Group title with a tri-state "select all" over the permissions the caller may grant. */
@Composable
private fun GroupHeader(
    group: String,
    perms: List<PermissionInfo>,
    selected: Set<String>,
    editable: Boolean,
    onSet: (Set<String>, Boolean) -> Unit,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val grants = LocalSession.current.grants
    val grantable = perms.map { it.code }.filter { grants.has(it) }.toSet()
    val count = perms.count { it.code in selected }
    val chosen = grantable.count { it in selected }
    val state = when {
        grantable.isEmpty() || chosen == 0 -> ToggleableState.Off
        chosen == grantable.size -> ToggleableState.On
        else -> ToggleableState.Indeterminate
    }
    val enabled = editable && grantable.isNotEmpty()
    Row(
        Modifier.fillMaxWidth().padding(top = Spacing.lg).heightIn(min = Spacing.touchTarget).clip(Radii.md)
            .clickable(enabled = enabled, role = SemanticsRole.Checkbox) {
                haptics.perform(Haptic.Toggle)
                onSet(grantable, state != ToggleableState.On)
            }
            .semantics { contentDescription = "Select all ${group.humanize()} permissions" }
            .padding(horizontal = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(group.humanize(), style = BistroTheme.type.sectionTitle, color = c.textPrimary, modifier = Modifier.semantics { heading() })
            Text("$count of ${perms.size} on", style = BistroTheme.type.metadata, color = c.textTertiary)
        }
        if (editable) {
            TriStateCheckbox(
                state = state, onClick = null, enabled = enabled,
                colors = CheckboxDefaults.colors(
                    checkedColor = c.ink, checkmarkColor = c.onInk, uncheckedColor = c.borderStrong,
                    disabledCheckedColor = c.textDisabled, disabledUncheckedColor = c.border,
                    disabledIndeterminateColor = c.textDisabled,
                ),
            )
        }
    }
}

@Composable
private fun RoleEditSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 56.dp)
        Skeleton(Modifier.fillMaxWidth(), 80.dp)
        repeat(3) {
            Skeleton(Modifier.fillMaxWidth(0.4f), 22.dp)
            repeat(3) { Skeleton(Modifier.fillMaxWidth(), 48.dp) }
        }
    }
}
