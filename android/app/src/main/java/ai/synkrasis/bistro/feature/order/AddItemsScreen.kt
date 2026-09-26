package ai.synkrasis.bistro.feature.order

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.QuantityStepper
import ai.synkrasis.bistro.core.designsystem.component.SkeletonList
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.pressScale
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.MenuItem
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun AddItemsScreen(orderId: Int) {
    val vm = bistroViewModel(key = "add-$orderId") { AddItemsViewModel(it, orderId) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    var confirmDiscard by remember { mutableStateOf(false) }
    CollectEffects(vm.effects.flow, onBack = navigator::back)
    val leave = { if (vm.cart.isEmpty()) navigator.back() else confirmDiscard = true }
    BackHandler(enabled = vm.cart.isNotEmpty()) { confirmDiscard = true }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BistroTopBar(
                title = vm.order?.let { "Add to ${it.tableName}" } ?: "Add items",
                eyebrow = vm.order?.let { "Check #${it.orderNumber}" },
                onBack = leave,
            )
            when (val s = vm.menu) {
                LoadState.Loading -> SkeletonList(rows = 7, rowHeight = 64.dp)
                is LoadState.Failed -> ErrorState(s.error, vm::load, Modifier.fillMaxSize())
                is LoadState.Ready -> {
                    val menu = s.data
                    val categories = remember(menu) { listOf<Int?>(null) + menu.categories.map { it.id } }
                    BistroTextField(
                        value = vm.query, onValueChange = { vm.query = it.take(40) }, label = "Search the menu",
                        leadingIcon = Icons.Rounded.Search,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.gutter),
                    )
                    Gap(Spacing.sm)
                    ChipRow(
                        options = categories, selected = vm.category, onSelect = { vm.category = it },
                        label = { id -> id?.let { i -> menu.categories.firstOrNull { it.id == i }?.name } ?: "All" },
                    )
                    Gap(Spacing.sm)
                    val q = vm.query.trim().lowercase()
                    val items = menu.items.filter { i ->
                        (vm.category == null || i.categoryId == vm.category) &&
                            (q.isEmpty() || i.name.lowercase().contains(q) || i.description?.lowercase()?.contains(q) == true)
                    }
                    if (items.isEmpty()) {
                        EmptyState(
                            Icons.Rounded.SearchOff,
                            if (menu.items.isEmpty()) "The menu is empty" else "Nothing matches",
                            if (menu.items.isEmpty()) "A manager needs to add menu items first." else "Try another word or category.",
                        )
                    }
                    LazyColumn(
                        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = 140.dp),
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(items, key = { it.id }) { item ->
                            MenuItemRow(
                                item = item, currency = session.currency, quantity = vm.quantityOf(item),
                                onAdd = {
                                    haptics.perform(Haptic.Selection)
                                    vm.add(item)
                                },
                                onRemove = {
                                    haptics.perform(Haptic.Selection)
                                    vm.decrement(item)
                                },
                                onLongPress = {
                                    haptics.perform(Haptic.LongPress)
                                    vm.noteFor = item
                                },
                                modifier = Modifier.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
                            )
                        }
                    }
                }
            }
        }
        CartBar(vm, session.currency, Modifier.align(Alignment.BottomCenter))
    }

    if (vm.reviewing) ReviewSheet(vm, session.currency)
    vm.noteFor?.let { item -> ItemNoteSheet(item, session.currency, onAdd = { qty, note -> vm.add(item, qty, note); vm.noteFor = null }, onDismiss = { vm.noteFor = null }) }
    if (confirmDiscard) {
        ConfirmDialog(
            title = "Discard ${vm.count} item${if (vm.count == 1) "" else "s"}?",
            message = "They haven't been added to the check yet.",
            confirmLabel = "Discard", destructive = true,
            onConfirm = { confirmDiscard = false; navigator.back() },
            onDismiss = { confirmDiscard = false },
        )
    }
}

@Composable
private fun MenuItemRow(
    item: MenuItem,
    currency: String,
    quantity: Int,
    onAdd: () -> Unit,
    onRemove: () -> Unit,
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = BistroTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val available = item.isAvailable
    Row(
        modifier.fillMaxWidth().pressScale(interaction, 0.985f).clip(Radii.lg)
            .background(if (quantity > 0) c.accentSoft else c.surface)
            .combinedClickable(
                interactionSource = interaction, indication = androidx.compose.material3.ripple(),
                enabled = available, role = Role.Button, onClickLabel = "Add one",
                onLongClickLabel = "Add with a note", onLongClick = onLongPress, onClick = onAdd,
            )
            .padding(horizontal = Spacing.lg, vertical = Spacing.md)
            .semantics(mergeDescendants = true) {
                contentDescription = "${item.name}, ${Format.money(item.price, currency)}" + if (!available) ", sold out" else ""
                if (quantity > 0) stateDescription = "$quantity in cart"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(item.name, style = BistroTheme.type.bodyStrong, color = if (available) c.textPrimary else c.textDisabled)
            item.description?.let {
                Text(it, style = BistroTheme.type.supporting, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(Format.money(item.price, currency), style = BistroTheme.type.amountSmall, color = if (available) c.textPrimary else c.textDisabled)
        }
        when {
            !available -> StatusChip("Sold out", Tone.Neutral)
            quantity > 0 -> QuantityStepper(quantity, { if (it > quantity) onAdd() else onRemove() }, min = 0, label = item.name, compact = true)
            else -> Box(
                Modifier.size(40.dp).clip(Radii.pill).background(c.ink),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.Add, null, tint = c.onInk, modifier = Modifier.size(20.dp)) }
        }
    }
}

@Composable
private fun CartBar(vm: AddItemsViewModel, currency: String, modifier: Modifier) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    AnimatedVisibility(
        visible = vm.cart.isNotEmpty(),
        enter = slideInVertically(Motion.enter()) { it } + fadeIn(Motion.enter()),
        exit = slideOutVertically(Motion.exit()) { it } + fadeOut(Motion.exit()),
        modifier = modifier,
    ) {
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(Spacing.gutter)
                .shadow(if (c.isDark) 0.dp else 16.dp, Radii.xl, ambientColor = c.shadow, spotColor = c.shadow)
                .clip(Radii.xl).background(c.ink).padding(start = Spacing.xl, end = Spacing.sm, top = Spacing.sm, bottom = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("${vm.count} item${if (vm.count == 1) "" else "s"}", style = BistroTheme.type.metadata, color = c.onInk.copy(alpha = 0.7f))
                Text(Format.money(vm.total, currency), style = BistroTheme.type.amountLarge, color = c.onInk)
            }
            BistroButton("Review", {
                haptics.perform(Haptic.Confirm)
                vm.reviewing = true
            }, style = ButtonStyle.Accent, size = ButtonSize.Large)
        }
    }
}

@Composable
private fun ReviewSheet(vm: AddItemsViewModel, currency: String) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    BistroSheet(
        title = "Review ${vm.count} item${if (vm.count == 1) "" else "s"}",
        subtitle = vm.order?.let { "Table ${it.tableName} · check #${it.orderNumber}" },
        onDismiss = { if (vm.submitting == null) vm.reviewing = false },
        busy = vm.submitting != null,
        actions = {
            ActionPair(
                secondary = {
                    BistroButton("Add only", { vm.submit(false) }, style = ButtonStyle.Secondary, size = ButtonSize.Large,
                        loading = vm.submitting == "add", enabled = vm.submitting == null, modifier = Modifier.fillMaxWidth())
                },
                primary = {
                    BistroButton("Add & send", {
                        haptics.perform(Haptic.Confirm)
                        vm.submit(true)
                    }, icon = Icons.Rounded.Send, style = ButtonStyle.Accent, size = ButtonSize.Large,
                        loading = vm.submitting == "send", enabled = vm.submitting == null, modifier = Modifier.fillMaxWidth())
                },
            )
        },
    ) {
        vm.cart.forEach { line ->
            Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(line.item.name, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
                    if (line.note.isNotEmpty()) Text("“${line.note}”", style = BistroTheme.type.supporting.copy(fontStyle = FontStyle.Italic), color = c.accent)
                    Text(Format.money(line.total, currency), style = BistroTheme.type.amountSmall, color = c.textSecondary)
                }
                QuantityStepper(line.quantity, { vm.setLine(line, it) }, min = 0, label = line.item.name, compact = true)
            }
        }
        Gap(Spacing.md)
        Row {
            Text("Total", style = BistroTheme.type.cardTitle, color = c.textPrimary, modifier = Modifier.weight(1f))
            Text(Format.money(vm.total, currency), style = BistroTheme.type.amountLarge, color = c.textPrimary)
        }
        Text("Taxes and service are added on the bill.", style = BistroTheme.type.metadata, color = c.textTertiary)
    }
}

@Composable
private fun ItemNoteSheet(item: MenuItem, currency: String, onAdd: (Int, String) -> Unit, onDismiss: () -> Unit) {
    var quantity by rememberSaveable(item.id) { mutableIntStateOf(1) }
    var note by rememberSaveable(item.id) { mutableStateOf("") }
    BistroSheet(
        title = item.name,
        subtitle = Format.money(item.price, currency) + (item.description?.let { " · $it" } ?: ""),
        onDismiss = onDismiss,
        actions = {
            BistroButton("Add to cart", { onAdd(quantity, note) }, Modifier.fillMaxWidth(), size = ButtonSize.Large,
                trailing = "· " + Format.money(item.price.multiply(quantity.toBigDecimal()), currency))
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Quantity", style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary, modifier = Modifier.weight(1f))
            QuantityStepper(quantity, { quantity = it }, min = 1, label = item.name)
        }
        Gap(Spacing.md)
        BistroTextField(note, { note = it.take(200) }, "Note for the kitchen", Modifier.fillMaxWidth(), placeholder = "e.g. No onions, extra spicy", singleLine = false, minLines = 2)
        Gap(Spacing.sm)
    }
}

