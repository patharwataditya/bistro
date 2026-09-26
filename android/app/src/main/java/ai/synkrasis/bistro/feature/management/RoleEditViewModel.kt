package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.PermissionInfo
import ai.synkrasis.bistro.data.api.Role
import ai.synkrasis.bistro.data.api.RoleCreate
import ai.synkrasis.bistro.data.api.RoleUpdate
import ai.synkrasis.bistro.navigation.NEW
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Immutable
data class RoleEditData(val permissions: List<PermissionInfo>, val role: Role?)

@Immutable
data class RoleForm(val name: String = "", val description: String = "", val permissions: Set<String> = emptySet()) {
    companion object {
        fun of(role: Role?) = RoleForm(role?.name.orEmpty(), role?.description.orEmpty(), role?.permissions?.toSet().orEmpty())
    }
}

class RoleEditViewModel(private val container: AppContainer, val roleId: Int) : ActionViewModel() {
    val isNew = roleId == NEW

    var state by mutableStateOf<LoadState<RoleEditData>>(LoadState.Loading)
        private set
    var form by mutableStateOf(RoleForm())
        private set
    var baseline by mutableStateOf(RoleForm())
        private set
    var errors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var confirmDelete by mutableStateOf(false)

    val dirty: Boolean get() = form != baseline

    private var loaded = false
    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        val perms = viewModelScope.async { container.staff.permissions() }
        val roles = if (isNew) null else viewModelScope.async { container.staff.roles() }
        val permResult = perms.await()
        val roleResult = roles?.await()
        val combined: ApiResult<RoleEditData> = when {
            permResult is ApiResult.Failure -> permResult
            roleResult is ApiResult.Failure -> roleResult
            else -> {
                val role = (roleResult as? ApiResult.Success)?.value?.firstOrNull { it.id == roleId }
                if (!isNew && role == null) {
                    ApiResult.Failure(AppError.NotFound("This role no longer exists."))
                } else {
                    ApiResult.Success(RoleEditData((permResult as ApiResult.Success).value, role))
                }
            }
        }
        // While edits are unsaved, keep the snapshot they started from (its version too), so a
        // concurrent change by someone else surfaces as a conflict rather than being reverted.
        if (loaded && dirty && combined is ApiResult.Success) return@withLock
        state = state.reduce(combined)
        if (combined is ApiResult.Success) {
            val fresh = RoleForm.of(combined.value.role)
            form = fresh
            baseline = fresh
            loaded = true
        }
    }

    fun edit(transform: (RoleForm) -> RoleForm) {
        form = transform(form)
        if (errors.isNotEmpty()) errors = emptyMap()
    }

    fun discard() {
        form = baseline
        errors = emptyMap()
    }

    fun save() {
        val current = form
        val role = state.dataOrNull?.role
        val name = current.name.trim()
        val description = current.description.trim()
        if (isNew) {
            act(
                "save",
                { container.staff.createRole(RoleCreate(name, description.ifBlank { null }, current.permissions.sorted())) },
                onFailure = ::captureErrors,
            ) { created ->
                baseline = RoleForm.of(created)
                form = baseline
                effects.success("Role ${created.name} created")
                effects.back()
            }
            return
        }
        role ?: return
        val body = RoleUpdate(
            version = role.version,
            name = name.takeIf { it != role.name },
            description = description.takeIf { it != role.description.orEmpty() },
            permissions = current.permissions.takeIf { it != role.permissions.toSet() }?.sorted(),
        )
        act("save", { container.staff.updateRole(role.id, body) }, onFailure = { error ->
            captureErrors(error)
            // Someone else saved first: show their version rather than silently overwriting it.
            if (error is AppError.Stale) loaded = false
        }) { updated ->
            state = LoadState.Ready(RoleEditData(state.dataOrNull?.permissions.orEmpty(), updated))
            baseline = RoleForm.of(updated)
            form = baseline
            effects.success("Saved ${updated.name}")
        }
    }

    fun delete() {
        val role = state.dataOrNull?.role ?: return
        act("delete", { container.staff.deleteRole(role.id) }, onFailure = { confirmDelete = false }) {
            confirmDelete = false
            effects.success("Role ${role.name} deleted")
            effects.back()
        }
    }

    private fun captureErrors(error: AppError) {
        errors = error.fieldErrors().ifEmpty {
            if (error is AppError.Conflict) mapOf("name" to error.message) else emptyMap()
        }
    }
}
