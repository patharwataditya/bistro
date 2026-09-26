package ai.synkrasis.bistro.feature.menu

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.Menu
import ai.synkrasis.bistro.data.api.MenuCategory
import ai.synkrasis.bistro.data.api.MenuItem
import ai.synkrasis.bistro.data.api.MenuItemIn
import ai.synkrasis.bistro.data.api.MenuItemUpdate
import ai.synkrasis.bistro.feature.management.ActionViewModel
import ai.synkrasis.bistro.feature.management.fieldErrors
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.math.BigDecimal

/** The add/edit item sheet: a new item (optionally in a category) or an existing one. */
@Immutable
sealed interface ItemEditor {
    data class New(val categoryId: Int?) : ItemEditor
    data class Existing(val item: MenuItem) : ItemEditor
}

/** What the item sheet submits. */
@Immutable
data class ItemFields(val categoryId: Int, val name: String, val description: String, val price: BigDecimal, val sortOrder: Int)

class MenuManageViewModel(private val container: AppContainer) : ActionViewModel() {
    var state by mutableStateOf<LoadState<Menu>>(LoadState.Loading)
        private set
    /** null = all categories. */
    var category by mutableStateOf<Int?>(null)
    var query by mutableStateOf("")
    var editor by mutableStateOf<ItemEditor?>(null)
        private set
    var itemErrors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var deleteTarget by mutableStateOf<MenuItem?>(null)
    var categoriesOpen by mutableStateOf(false)
    var categoryDelete by mutableStateOf<MenuCategory?>(null)
    var categoryError by mutableStateOf<String?>(null)
        private set

    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        state = state.reduce(container.menu.menu())
        val menu = state.dataOrNull
        if (menu != null && category != null && menu.categories.none { it.id == category }) category = null
    }

    fun openEditor(target: ItemEditor) {
        itemErrors = emptyMap()
        editor = target
    }

    fun closeEditor() {
        if (working == null) editor = null
    }

    private fun replaceItem(updated: MenuItem) {
        val menu = state.dataOrNull ?: return
        val items = if (menu.items.any { it.id == updated.id }) menu.items.map { if (it.id == updated.id) updated else it } else menu.items + updated
        state = LoadState.Ready(menu.copy(items = items))
    }

    /** Sold out / back on. The switch flips immediately and settles on the server's answer. */
    fun setAvailability(item: MenuItem, available: Boolean) {
        if (working != null) return
        replaceItem(item.copy(isAvailable = available))
        act(
            "avail-${item.id}",
            { container.menu.setAvailability(item.id, item.version, available) },
            onFailure = { error -> if (error !is AppError.Stale) replaceItem(item) },
        ) { updated ->
            replaceItem(updated)
            effects.success(if (available) "${updated.name} is back on" else "${updated.name} marked sold out")
        }
    }

    fun saveItem(fields: ItemFields) {
        val target = editor ?: return
        val onFailure: (AppError) -> Unit = { error ->
            itemErrors = error.fieldErrors().ifEmpty { if (error is AppError.Conflict) mapOf("name" to error.message) else emptyMap() }
        }
        when (target) {
            is ItemEditor.New -> act(
                "item",
                { container.menu.createItem(MenuItemIn(fields.categoryId, fields.name.trim(), fields.description.trim().ifBlank { null }, fields.price, sortOrder = fields.sortOrder)) },
                onFailure,
            ) { created ->
                editor = null
                category = created.categoryId.takeIf { category != null } ?: category
                effects.success("${created.name} added to the menu")
                refresh()
            }
            is ItemEditor.Existing -> {
                val item = target.item
                val body = MenuItemUpdate(
                    version = item.version,
                    categoryId = fields.categoryId.takeIf { it != item.categoryId },
                    name = fields.name.trim().takeIf { it != item.name },
                    // An empty string clears the description on the server; null leaves it.
                    description = fields.description.trim().takeIf { it != item.description.orEmpty() },
                    price = fields.price.takeIf { it.compareTo(item.price) != 0 },
                    sortOrder = fields.sortOrder.takeIf { it != item.sortOrder },
                )
                act("item", { container.menu.updateItem(item.id, body) }, onFailure = { error ->
                    onFailure(error)
                    if (error is AppError.Stale || error is AppError.NotFound) editor = null
                }) { updated ->
                    editor = null
                    effects.success("Saved ${updated.name}")
                    refresh()
                }
            }
        }
    }

    fun deleteItem(item: MenuItem) = act("delete", { container.menu.deleteItem(item.id) }, onFailure = { deleteTarget = null }) {
        deleteTarget = null
        editor = null
        effects.success("${item.name} removed from the menu")
        refresh()
    }

    fun addCategory(name: String, onDone: () -> Unit) = act(
        "cat-new",
        { container.menu.createCategory(name) },
        onFailure = { categoryError = it.message },
    ) { created ->
        categoryError = null
        onDone()
        effects.success("Category ${created.name} added")
        refresh()
    }

    fun renameCategory(target: MenuCategory, name: String, onDone: () -> Unit) = act(
        "cat-${target.id}",
        { container.menu.renameCategory(target.id, name, target.sortOrder) },
        onFailure = { categoryError = it.message },
    ) { updated ->
        categoryError = null
        onDone()
        effects.success("Renamed to ${updated.name}")
        refresh()
    }

    fun deleteCategory(target: MenuCategory) = act("cat-delete", { container.menu.deleteCategory(target.id) }, onFailure = { categoryDelete = null }) {
        categoryDelete = null
        if (category == target.id) category = null
        effects.success("Category ${target.name} removed")
        refresh()
    }

    fun clearCategoryError() {
        categoryError = null
    }
}
