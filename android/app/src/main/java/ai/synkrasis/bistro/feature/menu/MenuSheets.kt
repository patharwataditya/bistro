package ai.synkrasis.bistro.feature.menu

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.MoneyInput
import ai.synkrasis.bistro.data.api.Menu
import ai.synkrasis.bistro.data.api.MenuCategory
import ai.synkrasis.bistro.feature.management.GroupLabel
import ai.synkrasis.bistro.feature.management.NoticeCard
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun MenuSheets(menu: Menu, access: MenuAccess, vm: MenuManageViewModel) {
    vm.editor?.let { ItemEditorSheet(it, menu, access, vm) }
    if (vm.categoriesOpen) CategoriesSheet(menu, vm)
    vm.deleteTarget?.let { item ->
        ConfirmDialog(
            title = "Remove ${item.name}?",
            message = "It disappears from the menu. Past orders and bills keep their own copy of it.",
            confirmLabel = "Remove item",
            destructive = true,
            loading = vm.working == "delete",
            onConfirm = { vm.deleteItem(item) },
            onDismiss = { vm.deleteTarget = null },
        )
    }
    vm.categoryDelete?.let { cat ->
        ConfirmDialog(
            title = "Delete ${cat.name}?",
            message = if (cat.itemCount > 0) {
                "${cat.itemCount} ${if (cat.itemCount == 1) "item is" else "items are"} still in this category. Move or remove them first, or the delete will be refused."
            } else {
                "The category is removed from the menu."
            },
            confirmLabel = "Delete category",
            destructive = true,
            loading = vm.working == "cat-delete",
            onConfirm = { vm.deleteCategory(cat) },
            onDismiss = { vm.categoryDelete = null },
        )
    }
}

@Composable
private fun ItemEditorSheet(editor: ItemEditor, menu: Menu, access: MenuAccess, vm: MenuManageViewModel) {
    val session = LocalSession.current
    val existing = (editor as? ItemEditor.Existing)?.item
    val stateKey = existing?.let { "item-${it.id}-${it.version}" } ?: "item-new"
    val categories = menu.categories.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))
    var categoryId by rememberSaveable(stateKey) {
        mutableStateOf(existing?.categoryId ?: (editor as? ItemEditor.New)?.categoryId ?: categories.firstOrNull()?.id)
    }
    var name by rememberSaveable(stateKey) { mutableStateOf(existing?.name.orEmpty()) }
    var description by rememberSaveable(stateKey) { mutableStateOf(existing?.description.orEmpty()) }
    var price by rememberSaveable(stateKey) { mutableStateOf(existing?.price?.let(MoneyInput::display).orEmpty()) }
    var sort by rememberSaveable(stateKey) { mutableStateOf((existing?.sortOrder ?: 0).toString()) }

    val editable = existing == null || access.update
    val parsedPrice = MoneyInput.parse(price)
    val parsedSort = sort.toIntOrNull()?.takeIf { it in 0..10_000 }
    val valid = categoryId != null && name.isNotBlank() && parsedPrice != null && parsedSort != null
    val changed = existing == null || categoryId != existing.categoryId || name.trim() != existing.name ||
        description.trim() != existing.description.orEmpty() || parsedPrice?.compareTo(existing.price) != 0 || parsedSort != existing.sortOrder
    val errors = vm.itemErrors
    val submit = { vm.saveItem(ItemFields(categoryId!!, name, description, parsedPrice!!, parsedSort!!)) }

    BistroSheet(
        title = existing?.name ?: "New item",
        subtitle = if (existing != null) "Price changes apply to new orders only." else "It's available to order as soon as you add it.",
        onDismiss = vm::closeEditor,
        actions = {
            val saveButton: @Composable () -> Unit = {
                BistroButton(
                    if (existing == null) "Add item" else "Save", submit,
                    modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                    enabled = valid && changed, loading = vm.working == "item",
                )
            }
            when {
                existing != null && access.delete && editable -> ActionPair(
                    secondary = {
                        BistroButton("Remove", { vm.deleteTarget = existing }, style = ButtonStyle.Danger, icon = Icons.Rounded.DeleteOutline, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large)
                    },
                    primary = saveButton,
                )
                existing != null && access.delete -> BistroButton(
                    "Remove from menu", { vm.deleteTarget = existing }, style = ButtonStyle.Danger,
                    icon = Icons.Rounded.DeleteOutline, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                )
                editable -> saveButton()
            }
        },
    ) {
        if (!editable) {
            NoticeCard("You can remove this item, but not change its details.", icon = Icons.Rounded.Lock)
            Gap(Spacing.md)
        }
        Text("Category", style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary)
        Gap(Spacing.xs)
        if (editable) {
            ChipRow(categories.map { it.id }, categoryId ?: -1, { categoryId = it }, { id -> categories.first { it.id == id }.name }, edgePadding = 0.dp)
        } else {
            Text(categories.firstOrNull { it.id == categoryId }?.name.orEmpty(), style = BistroTheme.type.body, color = BistroTheme.colors.textSecondary)
        }
        errors["category_id"]?.let { Text(it, style = BistroTheme.type.metadata, color = BistroTheme.colors.danger) }
        Gap(Spacing.md)
        BistroTextField(
            name, { name = it.take(80) }, "Name", Modifier.fillMaxWidth(), enabled = editable, error = errors["name"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.sm)
        BistroTextField(
            description, { description = it.take(300) }, "Description (optional)", Modifier.fillMaxWidth(),
            enabled = editable, singleLine = false, minLines = 2, error = errors["description"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        Gap(Spacing.sm)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            BistroTextField(
                price, { if (MoneyInput.accept(it)) price = it }, "Price", Modifier.weight(1f),
                prefix = session.currency, enabled = editable, error = errors["price"],
                textStyle = BistroTheme.type.amount,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
            BistroTextField(
                sort, { v -> if (v.length <= 5 && v.all { it.isDigit() }) sort = v }, "Position", Modifier.width(120.dp),
                enabled = editable, error = errors["sort_order"] ?: if (sort.isNotEmpty() && parsedSort == null) "0–10000" else null,
                supporting = "Lower first",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        }
        Gap(Spacing.md)
    }
}

@Composable
private fun CategoriesSheet(menu: Menu, vm: MenuManageViewModel) {
    var newName by rememberSaveable { mutableStateOf("") }
    var renaming by rememberSaveable { mutableStateOf<Int?>(null) }
    val categories = menu.categories.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))
    BistroSheet(
        title = "Categories",
        subtitle = "How the menu is grouped for staff",
        onDismiss = {
            if (vm.working == null) {
                vm.clearCategoryError()
                vm.categoriesOpen = false
            }
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            BistroTextField(
                newName, { newName = it.take(60); vm.clearCategoryError() }, "New category", Modifier.weight(1f),
                placeholder = "e.g. Desserts",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )
            BistroButton(
                "Add", { vm.addCategory(newName) { newName = "" } }, icon = Icons.Rounded.Add,
                enabled = newName.isNotBlank(), loading = vm.working == "cat-new",
            )
        }
        vm.categoryError?.let {
            Gap(Spacing.xs)
            Text(it, style = BistroTheme.type.metadata, color = BistroTheme.colors.danger)
        }
        GroupLabel("${categories.size} ${if (categories.size == 1) "category" else "categories"}")
        if (categories.isEmpty()) {
            Text("No categories yet. Add one above.", style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
        }
        categories.forEachIndexed { index, cat ->
            if (index > 0) HairlineDivider()
            if (renaming == cat.id) {
                CategoryRenameRow(cat, vm) { renaming = null }
            } else {
                CategoryRow(
                    cat,
                    onRename = {
                        vm.clearCategoryError()
                        renaming = cat.id
                    },
                    onDelete = { vm.categoryDelete = cat },
                )
            }
        }
        Gap(Spacing.lg)
    }
}

@Composable
private fun CategoryRow(cat: MenuCategory, onRename: () -> Unit, onDelete: () -> Unit) {
    val c = BistroTheme.colors
    Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touchTarget), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(cat.name, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
            Text("${cat.itemCount} ${if (cat.itemCount == 1) "item" else "items"}", style = BistroTheme.type.metadata, color = c.textTertiary)
        }
        BistroIconButton(Icons.Rounded.Edit, "Rename ${cat.name}", onRename, tint = c.textSecondary)
        BistroIconButton(Icons.Rounded.DeleteOutline, "Delete ${cat.name}", onDelete, tint = c.danger)
    }
}

@Composable
private fun CategoryRenameRow(cat: MenuCategory, vm: MenuManageViewModel, onDone: () -> Unit) {
    var name by rememberSaveable(cat.id) { mutableStateOf(cat.name) }
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
        BistroTextField(
            name, { name = it.take(60) }, "Name", Modifier.weight(1f),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        BistroIconButton(Icons.Rounded.Close, "Cancel rename", onDone, tint = BistroTheme.colors.textSecondary)
        BistroIconButton(
            Icons.Rounded.Check, "Save name",
            { vm.renameCategory(cat, name, onDone) },
            enabled = name.isNotBlank() && name.trim() != cat.name && vm.working == null,
        )
    }
}
