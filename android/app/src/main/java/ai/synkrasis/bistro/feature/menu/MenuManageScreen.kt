package ai.synkrasis.bistro.feature.menu

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
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
import ai.synkrasis.bistro.data.api.Menu
import ai.synkrasis.bistro.data.api.MenuItem
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.feature.management.BistroSwitch
import ai.synkrasis.bistro.feature.management.GroupLabel
import ai.synkrasis.bistro.feature.management.SearchField
import ai.synkrasis.bistro.feature.management.itemMotion
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.DoNotDisturbOn
import androidx.compose.material.icons.rounded.RestaurantMenu
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** Menu permissions resolved once per screen. */
data class MenuAccess(
    val create: Boolean,
    val update: Boolean,
    val delete: Boolean,
    val categories: Boolean,
    val availability: Boolean,
)

@Composable
fun MenuManageScreen() {
    val vm = bistroViewModel(key = "menu-manage") { MenuManageViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    PollWhileVisible(30_000) { vm.refresh() }
    val access = MenuAccess(
        create = session.can(Permission.MENU_CREATE),
        update = session.can(Permission.MENU_UPDATE),
        delete = session.can(Permission.MENU_DELETE),
        categories = session.can(Permission.MENU_MANAGE_CATEGORIES),
        availability = session.can(Permission.MENU_SET_AVAILABILITY),
    )
    val menu = vm.state.dataOrNull
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Menu",
            subtitle = menu?.let { m ->
                val out = m.items.count { !it.isAvailable }
                "${m.items.size} items" + if (out > 0) " · $out sold out" else ""
            },
            onBack = navigator::back,
            actions = {
                if (access.categories) {
                    BistroIconButton(Icons.Rounded.Category, "Manage categories", {
                        haptics.perform(Haptic.Selection)
                        vm.categoriesOpen = true
                    })
                }
                if (access.create && menu?.categories?.isNotEmpty() == true) {
                    BistroIconButton(Icons.Rounded.Add, "Add item", {
                        haptics.perform(Haptic.Selection)
                        vm.openEditor(ItemEditor.New(vm.category))
                    })
                }
            },
        )
        when (val s = vm.state) {
            LoadState.Loading -> MenuSkeleton()
            is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
            is LoadState.Ready -> MenuContent(s.data, s.staleError, access, vm)
        }
    }
    if (menu != null) MenuSheets(menu, access, vm)
}

@Composable
private fun MenuContent(menu: Menu, staleError: AppError?, access: MenuAccess, vm: MenuManageViewModel) {
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    val categories = menu.categories.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))
    val q = vm.query.trim().lowercase()
    val visible = menu.items
        .filter { vm.category == null || it.categoryId == vm.category }
        .filter { q.isEmpty() || q in it.name.lowercase() || q in it.description.orEmpty().lowercase() }
    val groups = categories.mapNotNull { cat ->
        visible.filter { it.categoryId == cat.id }.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))
            .takeIf { it.isNotEmpty() }?.let { cat to it }
    }
    val chipOptions: List<Int?> = listOf<Int?>(null) + categories.map { it.id }
    LazyColumn(
        contentPadding = PaddingValues(bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError, Modifier.padding(horizontal = Spacing.gutter)) }
        if (menu.items.isNotEmpty()) {
            item(key = "search") {
                SearchField(vm.query, { vm.query = it.take(60) }, "Dish name", Modifier.fillMaxWidth().padding(horizontal = Spacing.gutter))
            }
        }
        if (categories.size > 1) {
            item(key = "chips") {
                ChipRow(chipOptions, vm.category, { vm.category = it }, { id ->
                    if (id == null) "All" else categories.first { it.id == id }.let { c -> "${c.name} · ${menu.items.count { i -> i.categoryId == c.id }}" }
                })
            }
        }
        if (visible.isEmpty()) {
            item(key = "empty") { MenuEmpty(menu, q.isNotEmpty(), access, vm) }
        }
        groups.forEach { (cat, items) ->
            if (vm.category == null) {
                item(key = "h-${cat.id}") { GroupLabel(cat.name, Modifier.padding(horizontal = Spacing.gutter).itemMotion(this)) }
            }
            items(items, key = { it.id }) { item ->
                MenuItemRow(
                    item = item,
                    currency = session.currency,
                    access = access,
                    busy = vm.working == "avail-${item.id}",
                    onOpen = {
                        haptics.perform(Haptic.Selection)
                        vm.openEditor(ItemEditor.Existing(item))
                    },
                    onAvailability = { vm.setAvailability(item, it) },
                    modifier = Modifier.padding(horizontal = Spacing.gutter).itemMotion(this),
                )
            }
        }
    }
}

@Composable
private fun MenuEmpty(menu: Menu, searching: Boolean, access: MenuAccess, vm: MenuManageViewModel) {
    when {
        searching -> EmptyState(Icons.Rounded.SearchOff, "No dishes match", "Try another name, or clear the search.")
        menu.categories.isEmpty() -> EmptyState(
            Icons.Rounded.Category, "Start with a category",
            if (access.categories) "Group dishes into categories like Starters or Drinks, then add items." else "A manager needs to set up menu categories first.",
            action = if (access.categories) {
                { BistroButton("Add a category", { vm.categoriesOpen = true }, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary) }
            } else {
                null
            },
        )
        else -> EmptyState(
            Icons.Rounded.RestaurantMenu, "No dishes here yet",
            if (access.create) "Add the first item to this menu." else "Items will appear once a manager adds them.",
            action = if (access.create) {
                { BistroButton("Add item", { vm.openEditor(ItemEditor.New(vm.category)) }, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary) }
            } else {
                null
            },
        )
    }
}

@Composable
private fun MenuItemRow(
    item: MenuItem,
    currency: String,
    access: MenuAccess,
    busy: Boolean,
    onOpen: () -> Unit,
    onAvailability: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = BistroTheme.colors
    val canOpen = access.update || access.delete
    BistroCard(
        modifier.fillMaxWidth(),
        onClick = if (canOpen) onOpen else null,
        onClickLabel = "Edit ${item.name}",
        elevated = false,
        contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.sm, top = Spacing.md, bottom = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Column(Modifier.weight(1f)) {
                Text(
                    item.name, style = BistroTheme.type.cardTitle,
                    color = if (item.isAvailable) c.textPrimary else c.textSecondary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                item.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = BistroTheme.type.supporting, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(Format.money(item.price, currency), style = BistroTheme.type.amount, color = c.textPrimary)
                    if (!item.isAvailable) StatusChip("Sold out", Tone.Danger, icon = Icons.Rounded.DoNotDisturbOn)
                }
            }
            if (access.availability) {
                BistroSwitch(
                    checked = item.isAvailable,
                    onCheckedChange = onAvailability,
                    description = "${item.name} available",
                    enabled = !busy,
                )
            }
        }
    }
}

@Composable
private fun MenuSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 56.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            repeat(3) { Skeleton(Modifier.weight(1f), 40.dp) }
        }
        repeat(6) { Skeleton(Modifier.fillMaxWidth(), 72.dp) }
    }
}
