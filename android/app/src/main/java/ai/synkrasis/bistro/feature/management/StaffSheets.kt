package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.StaffMember
import ai.synkrasis.bistro.domain.Grants
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType

private val USERNAME = Regex("^[A-Za-z0-9._-]{3,40}$")

/** Whether the caller could assign this role (its permissions ⊆ theirs). Unknown → let the server decide. */
private fun RoleOption.grantableBy(grants: Grants) = permissions?.all { grants.has(it) } ?: true

@Composable
fun StaffSheets(vm: StaffViewModel, data: StaffData?) {
    if (vm.creating && data != null) {
        CreateStaffSheet(
            roles = data.roles,
            busy = vm.working == "create",
            errors = vm.createErrors,
            onCreate = vm::create,
            onDismiss = { if (vm.working != "create") vm.creating = false },
        )
    }
    val member = vm.selectedId?.let { id -> data?.members?.firstOrNull { it.id == id } }
    if (member != null && data != null) {
        StaffDetailSheet(member, data.roles, vm, onDismiss = { vm.selectedId = null })
    }
    vm.confirmActive?.let { target ->
        val deactivating = target.isActive
        ConfirmDialog(
            title = if (deactivating) "Deactivate ${target.fullName}?" else "Reactivate ${target.fullName}?",
            message = if (deactivating) {
                "They're signed out on every device and can't sign in until reactivated. Their history stays."
            } else {
                "They can sign in again with their existing password and roles."
            },
            confirmLabel = if (deactivating) "Deactivate" else "Reactivate",
            destructive = deactivating,
            loading = vm.working == "active",
            onConfirm = { vm.setActive(target, !deactivating) },
            onDismiss = { vm.confirmActive = null },
        )
    }
}

@Composable
private fun CreateStaffSheet(
    roles: List<RoleOption>,
    busy: Boolean,
    errors: Map<String, String>,
    onCreate: (fullName: String, username: String, password: String, roleIds: List<Int>) -> Unit,
    onDismiss: () -> Unit,
) {
    var fullName by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var roleIds by remember { mutableStateOf(emptySet<Int>()) }
    val usernameOk = USERNAME.matches(username.trim())
    val valid = fullName.isNotBlank() && usernameOk && PasswordRules.problem(password) == null && roleIds.isNotEmpty()
    BistroSheet(
        title = "Add staff",
        subtitle = "They sign in with this username and password.",
        onDismiss = onDismiss,
        actions = {
            BistroButton(
                "Create account", { onCreate(fullName, username, password, roleIds.toList()) },
                modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large, style = ButtonStyle.Accent,
                enabled = valid, loading = busy,
            )
        },
    ) {
        BistroTextField(
            fullName, { fullName = it.take(120) }, "Full name", Modifier.fillMaxWidth(),
            error = errors["full_name"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.sm)
        BistroTextField(
            username, { username = it.take(40).trim() }, "Username", Modifier.fillMaxWidth(),
            prefix = "@",
            error = errors["username"] ?: if (username.isNotEmpty() && !usernameOk) "3–40 letters, numbers, dots, dashes or underscores" else null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
        )
        Gap(Spacing.sm)
        BistroTextField(
            password, { password = it.take(128) }, "Temporary password", Modifier.fillMaxWidth(),
            password = true,
            error = errors["password"],
            supporting = PasswordRules.hint(password),
        )
        GroupLabel("Roles")
        RolePicker(roles, roleIds, { roleIds = it }, enabled = true)
        errors["role_ids"]?.let { Text(it, style = BistroTheme.type.metadata, color = BistroTheme.colors.danger) }
        if (roleIds.isEmpty()) {
            Text("Pick at least one role.", style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary)
        }
        Gap(Spacing.md)
    }
}

@Composable
private fun RolePicker(roles: List<RoleOption>, selected: Set<Int>, onChange: (Set<Int>) -> Unit, enabled: Boolean) {
    val grants = LocalSession.current.grants
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        roles.forEach { role ->
            val grantable = role.grantableBy(grants)
            val isSelected = role.id in selected
            SelectChip(
                label = role.name,
                selected = isSelected,
                enabled = enabled && grantable,
                locked = !grantable,
                onToggle = { onChange(if (isSelected) selected - role.id else selected + role.id) },
            )
        }
    }
    if (enabled && roles.any { !it.grantableBy(grants) }) {
        Gap(Spacing.sm)
        Text(
            "Locked roles include access you don't have, so you can't assign them.",
            style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary,
        )
    }
}

@Composable
private fun StaffDetailSheet(member: StaffMember, roles: List<RoleOption>, vm: StaffViewModel, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val isMe = member.id == session.me.id
    // The server's reason, mirrored so a disabled control always explains itself.
    val blocker = when {
        isMe -> "You can't change your own access. Ask another manager."
        !member.manageable -> "This person has access you don't have, so you can't manage them."
        else -> null
    }
    BistroSheet(
        title = member.fullName,
        subtitle = "@${member.username}",
        onDismiss = { if (vm.working == null) onDismiss() },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Avatar(member.fullName, muted = !member.isActive)
            if (member.isActive) {
                StatusChip("Active", Tone.Success, icon = Icons.Rounded.CheckCircle)
            } else {
                StatusChip("Inactive", Tone.Neutral, icon = Icons.Rounded.PersonOff)
            }
        }
        Gap(Spacing.sm)
        DetailLine("Last sign-in", member.lastLoginAt?.let { Format.dateTime(it, session.zone) } ?: "Never")
        DetailLine("Added", Format.dateTime(member.createdAt, session.zone))

        if (blocker != null) {
            // Nothing here can be changed by this user: say why once, not under every section.
            GroupLabel("Roles")
            if (member.roles.isEmpty()) {
                Text("No roles", style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
            } else {
                RolePills(member.roles)
            }
            Gap(Spacing.md)
            NoticeCard(blocker, icon = Icons.Rounded.Lock)
        } else {
            RolesSection(member, roles, null, vm)
            if (session.can(Permission.STAFF_UPDATE)) PasswordSection(member, isMe, null, vm)
            if (session.can(Permission.STAFF_DEACTIVATE)) StatusSection(member, null, vm)
        }
        Gap(Spacing.lg)
    }
}

@Composable
private fun RolesSection(member: StaffMember, roles: List<RoleOption>, blocker: String?, vm: StaffViewModel) {
    val session = LocalSession.current
    val canEdit = session.can(Permission.STAFF_UPDATE) && blocker == null && member.manageable
    GroupLabel("Roles")
    if (!canEdit) {
        if (member.roles.isEmpty()) {
            Text("No roles", style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
        } else {
            RolePills(member.roles)
        }
        if (session.can(Permission.STAFF_UPDATE) && blocker != null) {
            Gap(Spacing.sm)
            NoticeCard(blocker, icon = Icons.Rounded.Lock)
        }
        return
    }
    val original = remember(member.id, member.version) { member.roles.map { it.id }.toSet() }
    var selected by remember(member.id, member.version) { mutableStateOf(original) }
    // Roles they hold that the caller can't see in the list (should not happen) are kept.
    val options = roles + member.roles.filter { r -> roles.none { it.id == r.id } }.map { RoleOption(it.id, it.name, null) }
    RolePicker(options, selected, { selected = it }, enabled = true)
    if (selected != original) {
        Gap(Spacing.md)
        ActionPair(
            secondary = { BistroButton("Undo", { selected = original }, style = ButtonStyle.Secondary, modifier = Modifier.fillMaxWidth()) },
            primary = {
                BistroButton(
                    "Save roles", { vm.updateRoles(member, selected.toList()) },
                    enabled = selected.isNotEmpty(), loading = vm.working == "roles", modifier = Modifier.fillMaxWidth(),
                )
            },
        )
        if (selected.isEmpty()) {
            Text("Everyone needs at least one role.", style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary)
        }
    }
}

@Composable
private fun PasswordSection(member: StaffMember, isMe: Boolean, blocker: String?, vm: StaffViewModel) {
    GroupLabel("Password")
    if (!member.passwordResettable) {
        NoticeCard(
            when {
                isMe -> "To change your own password, use your account settings."
                blocker != null -> blocker
                else -> "Only someone with more access than ${member.fullName.substringBefore(' ')} can reset this password."
            },
            icon = Icons.Rounded.Lock,
        )
        return
    }
    var password by remember(member.id, member.version) { mutableStateOf("") }
    BistroTextField(
        password, { password = it.take(128) }, "New password", Modifier.fillMaxWidth(),
        password = true, supporting = PasswordRules.hint(password),
    )
    Gap(Spacing.sm)
    BistroButton(
        "Reset password", { vm.resetPassword(member, password) },
        icon = Icons.Rounded.Key, style = ButtonStyle.Secondary,
        enabled = PasswordRules.problem(password) == null, loading = vm.working == "password",
        modifier = Modifier.fillMaxWidth(),
    )
    Text(
        "They'll be signed out everywhere and use the new password next time.",
        style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary,
    )
}

@Composable
private fun StatusSection(member: StaffMember, blocker: String?, vm: StaffViewModel) {
    GroupLabel("Account")
    if (blocker != null) {
        NoticeCard(blocker, icon = Icons.Rounded.Lock)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        if (member.isActive) {
            BistroButton(
                "Deactivate", { vm.confirmActive = member }, icon = Icons.Rounded.Block,
                style = ButtonStyle.Danger, modifier = Modifier.fillMaxWidth(),
            )
            Text("Stops them signing in. Nothing they did is deleted.", style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary)
        } else {
            BistroButton(
                "Reactivate", { vm.confirmActive = member }, icon = Icons.Rounded.CheckCircle,
                style = ButtonStyle.Secondary, modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
