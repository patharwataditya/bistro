package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.Role
import ai.synkrasis.bistro.data.api.RoleSummary
import ai.synkrasis.bistro.data.api.StaffMember
import ai.synkrasis.bistro.data.api.UserCreate
import ai.synkrasis.bistro.data.api.UserUpdate
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A role that can be picked for someone. [permissions] is null when the caller can't read
 * roles (no roles.view): the server still decides whether the assignment is allowed.
 */
@Immutable
data class RoleOption(val id: Int, val name: String, val permissions: Set<String>?)

@Immutable
data class StaffData(val members: List<StaffMember>, val roles: List<RoleOption>)

class StaffViewModel(private val container: AppContainer, private val canReadRoles: Boolean) : ActionViewModel() {
    var state by mutableStateOf<LoadState<StaffData>>(LoadState.Loading)
        private set
    var query by mutableStateOf("")
    var showInactive by mutableStateOf(false)
        private set
    var creating by mutableStateOf(false)
    var createErrors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    /** Id rather than the object so the open sheet follows refreshes. */
    var selectedId by mutableStateOf<Int?>(null)
    var confirmActive by mutableStateOf<StaffMember?>(null)

    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        val members = viewModelScope.async { container.staff.users(showInactive) }
        val roles = if (canReadRoles) viewModelScope.async { container.staff.roles() } else null
        val usersResult = members.await()
        val roleResult = roles?.await()
        state = state.reduce(
            when (usersResult) {
                is ApiResult.Failure -> usersResult
                is ApiResult.Success -> {
                    val list = usersResult.value.items
                    val options = when (roleResult) {
                        is ApiResult.Success -> roleResult.value.map(Role::toOption)
                        else -> list.flatMap { it.roles }.distinctBy { it.id }.sortedBy { it.name.lowercase() }.map(RoleSummary::toOption)
                    }
                    ApiResult.Success(StaffData(list, options))
                }
            },
        )
    }

    fun toggleInactive(show: Boolean) {
        showInactive = show
        viewModelScope.launch { refresh() }
    }

    fun visible(data: StaffData): List<StaffMember> {
        val q = query.trim().lowercase()
        return data.members
            .filter { showInactive || it.isActive }
            .filter { q.isEmpty() || q in it.fullName.lowercase() || q in it.username.lowercase() || it.roles.any { r -> q in r.name.lowercase() } }
            .sortedWith(compareByDescending<StaffMember> { it.isActive }.thenBy { it.fullName.lowercase() })
    }

    fun openCreate() {
        createErrors = emptyMap()
        creating = true
    }

    fun create(fullName: String, username: String, password: String, roleIds: List<Int>) = act(
        "create",
        { container.staff.create(UserCreate(username.trim(), fullName.trim(), password, roleIds)) },
        onFailure = { error ->
            createErrors = error.fieldErrors().ifEmpty {
                if (error is ai.synkrasis.bistro.core.network.AppError.Conflict) mapOf("username" to error.message) else emptyMap()
            }
        },
    ) { member ->
        creating = false
        createErrors = emptyMap()
        effects.success("${member.fullName} can sign in now")
        refresh()
    }

    fun updateRoles(member: StaffMember, roleIds: List<Int>) = act(
        "roles",
        { container.staff.update(member.id, UserUpdate(member.version, roleIds = roleIds)) },
    ) {
        effects.success("Updated access for ${member.fullName}")
        refresh()
    }

    fun resetPassword(member: StaffMember, password: String) = act(
        "password",
        { container.staff.resetPassword(member.id, member.version, password) },
    ) {
        effects.success("Password reset. ${member.fullName} is signed out everywhere.")
        refresh()
    }

    fun setActive(member: StaffMember, active: Boolean) = act(
        "active",
        { if (active) container.staff.reactivate(member.id, member.version) else container.staff.deactivate(member.id, member.version) },
        onFailure = { confirmActive = null },
    ) {
        confirmActive = null
        effects.success(if (active) "${member.fullName} is active again" else "${member.fullName} can no longer sign in")
        refresh()
    }
}

private fun Role.toOption() = RoleOption(id, name, permissions.toSet())
private fun RoleSummary.toOption() = RoleOption(id, name, null)
