package ai.synkrasis.bistro.feature.floor

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
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
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
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
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.data.api.Area
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.Floor
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.feature.management.ActionViewModel
import ai.synkrasis.bistro.feature.management.GroupLabel
import ai.synkrasis.bistro.feature.management.NoticeCard
import ai.synkrasis.bistro.feature.management.fieldErrors
import ai.synkrasis.bistro.feature.management.itemMotion
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// ---------- state ----------

@Immutable
sealed interface TableEditor {
    data class New(val areaId: Int?) : TableEditor
    data class Existing(val table: DiningTable) : TableEditor
}

class TablesManageViewModel(private val container: AppContainer) : ActionViewModel() {
    var state by mutableStateOf<LoadState<Floor>>(LoadState.Loading)
        private set
    var editor by mutableStateOf<TableEditor?>(null)
        private set
    var errors by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var deleteTarget by mutableStateOf<DiningTable?>(null)
    var areaDelete by mutableStateOf<Area?>(null)
    var addingArea by mutableStateOf(false)

    private val lock = Mutex()

    override suspend fun refresh() = lock.withLock {
        state = state.markRefreshing()
        state = state.reduce(container.floor.floor())
    }

    fun openEditor(target: TableEditor) {
        errors = emptyMap()
        editor = target
    }

    fun closeEditor() {
        if (working == null) editor = null
    }

    private fun captureErrors(error: AppError) {
        errors = error.fieldErrors().ifEmpty { if (error is AppError.Conflict) mapOf("name" to error.message) else emptyMap() }
    }

    fun saveTable(name: String, capacity: Int, areaId: Int?) {
        when (val target = editor ?: return) {
            is TableEditor.New -> act("table", { container.floor.createTable(name, capacity, areaId) }, ::captureErrors) { created ->
                editor = null
                effects.success("Table ${created.name} added")
                refresh()
            }
            is TableEditor.Existing -> act(
                "table",
                { container.floor.updateTable(target.table, name, capacity, areaId) },
                onFailure = { error ->
                    captureErrors(error)
                    if (error is AppError.Stale || error is AppError.NotFound) editor = null
                },
            ) { updated ->
                editor = null
                effects.success("Saved table ${updated.name}")
                refresh()
            }
        }
    }

    fun deleteTable(table: DiningTable) = act("delete", { container.floor.deleteTable(table.id) }, onFailure = { deleteTarget = null }) {
        deleteTarget = null
        editor = null
        effects.success("Table ${table.name} removed")
        refresh()
    }

    fun addArea(name: String) = act("area", { container.floor.createArea(name) }, ::captureErrors) { area ->
        addingArea = false
        errors = emptyMap()
        effects.success("Area ${area.name} added")
        refresh()
    }

    fun deleteArea(area: Area) = act("area-delete", { container.floor.deleteArea(area.id) }, onFailure = { areaDelete = null }) {
        areaDelete = null
        effects.success("Area ${area.name} removed")
        refresh()
    }
}

@Immutable
private data class TablesAccess(val create: Boolean, val update: Boolean, val delete: Boolean)

// ---------- screen ----------

@Composable
fun TablesManageScreen() {
    val vm = bistroViewModel(key = "tables-manage") { TablesManageViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    PollWhileVisible(30_000) { vm.refresh() }
    val access = TablesAccess(
        create = session.can(Permission.TABLES_CREATE),
        update = session.can(Permission.TABLES_UPDATE),
        delete = session.can(Permission.TABLES_DELETE),
    )
    val floor = vm.state.dataOrNull
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Tables & areas",
            subtitle = floor?.let { f -> "${f.tables.size} tables · ${f.tables.sumOf { it.capacity }} seats" },
            onBack = navigator::back,
            actions = {
                if (access.create) {
                    BistroIconButton(Icons.Rounded.Add, "Add table", {
                        haptics.perform(Haptic.Selection)
                        vm.openEditor(TableEditor.New(null))
                    })
                }
            },
        )
        when (val s = vm.state) {
            LoadState.Loading -> TablesSkeleton()
            is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
            is LoadState.Ready -> TablesContent(s.data, s.staleError, access, vm)
        }
    }
    if (floor != null) TablesSheets(floor, access, vm)
}

@Composable
private fun TablesContent(floor: Floor, staleError: AppError?, access: TablesAccess, vm: TablesManageViewModel) {
    val haptics = LocalHaptics.current
    val areas = floor.areas.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))
    val groups: List<Pair<Area?, List<DiningTable>>> = buildList {
        areas.forEach { area -> floor.tables.filter { it.areaId == area.id }.takeIf { it.isNotEmpty() }?.let { add(area to it) } }
        floor.tables.filter { t -> t.areaId == null || areas.none { it.id == t.areaId } }.takeIf { it.isNotEmpty() }?.let { add(null to it) }
    }.map { (area, tables) -> area to tables.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() })) }
    val canOpen = access.update || access.delete

    LazyColumn(
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        item(key = "areas") { AreasCard(areas, floor.tables, access, vm) }
        if (floor.tables.isEmpty()) {
            item(key = "empty") {
                EmptyState(
                    Icons.Rounded.TableRestaurant, "No tables yet",
                    if (access.create) "Add each table with its seats so staff can seat guests." else "A manager needs to add the tables.",
                    action = if (access.create) {
                        { BistroButton("Add table", { vm.openEditor(TableEditor.New(null)) }, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary) }
                    } else {
                        null
                    },
                )
            }
        }
        groups.forEach { (area, tables) ->
            item(key = "h-${area?.id ?: "none"}") {
                GroupLabel(
                    "${area?.name ?: "No area"} · ${tables.size}",
                    Modifier.itemMotion(this),
                )
            }
            items(tables, key = { it.id }) { table ->
                ManageTableRow(
                    table,
                    onClick = if (canOpen) {
                        {
                            haptics.perform(Haptic.Selection)
                            vm.openEditor(TableEditor.Existing(table))
                        }
                    } else {
                        null
                    },
                    modifier = Modifier.itemMotion(this),
                )
            }
        }
    }
}

@Composable
private fun AreasCard(areas: List<Area>, tables: List<DiningTable>, access: TablesAccess, vm: TablesManageViewModel) {
    val c = BistroTheme.colors
    BistroCard(Modifier.fillMaxWidth(), elevated = false) {
        SectionHeader(
            "Areas", subtitle = "Sections of the room, like Terrace or Bar",
            action = if (access.create) {
                { BistroButton("Add", { vm.addingArea = true }, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary) }
            } else {
                null
            },
        )
        Gap(Spacing.md)
        if (areas.isEmpty()) {
            Text("No areas. Tables work fine without one.", style = BistroTheme.type.supporting, color = c.textSecondary)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            areas.forEach { area ->
                val count = tables.count { it.areaId == area.id }
                Row(
                    Modifier.heightIn(min = Spacing.touchTarget).clip(Radii.pill).background(c.surfaceSunken)
                        .padding(start = Spacing.lg, end = if (access.delete) 0.dp else Spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(area.name, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
                    Text(" · $count", style = BistroTheme.type.metadata, color = c.textTertiary)
                    if (access.delete) {
                        BistroIconButton(Icons.Rounded.Close, "Delete area ${area.name}", { vm.areaDelete = area }, tint = c.textSecondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun ManageTableRow(table: DiningTable, onClick: (() -> Unit)?, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    BistroCard(
        modifier.fillMaxWidth(), onClick = onClick, onClickLabel = "Edit table ${table.name}", elevated = false,
        contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Text(table.name, style = BistroTheme.type.tableLabel, color = c.textPrimary)
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Icon(Icons.Rounded.Groups, null, tint = c.textTertiary, modifier = Modifier.padding(end = Spacing.xxs))
                Text("${table.capacity} ${if (table.capacity == 1) "seat" else "seats"}", style = BistroTheme.type.supporting, color = c.textSecondary)
            }
            if (table.activeOrder != null) {
                StatusChip("Open order", Tone.Accent, icon = Icons.AutoMirrored.Rounded.ReceiptLong)
            } else {
                val v = table.status.visual
                StatusChip(v.label, v.tone, icon = v.icon)
            }
        }
    }
}

// ---------- sheets ----------

@Composable
private fun TablesSheets(floor: Floor, access: TablesAccess, vm: TablesManageViewModel) {
    vm.editor?.let { TableEditorSheet(it, floor.areas, access, vm) }
    if (vm.addingArea) AddAreaSheet(vm)
    vm.deleteTarget?.let { table ->
        ConfirmDialog(
            title = "Remove table ${table.name}?",
            message = "It disappears from the floor. Past orders keep their table name.",
            confirmLabel = "Remove table",
            destructive = true,
            loading = vm.working == "delete",
            onConfirm = { vm.deleteTable(table) },
            onDismiss = { vm.deleteTarget = null },
        )
    }
    vm.areaDelete?.let { area ->
        val count = floor.tables.count { it.areaId == area.id }
        ConfirmDialog(
            title = "Delete ${area.name}?",
            message = if (count > 0) {
                "$count ${if (count == 1) "table is" else "tables are"} still in this area. Move or remove them first, or the delete will be refused."
            } else {
                "The area is removed. No tables use it."
            },
            confirmLabel = "Delete area",
            destructive = true,
            loading = vm.working == "area-delete",
            onConfirm = { vm.deleteArea(area) },
            onDismiss = { vm.areaDelete = null },
        )
    }
}

@Composable
private fun TableEditorSheet(editor: TableEditor, areas: List<Area>, access: TablesAccess, vm: TablesManageViewModel) {
    val existing = (editor as? TableEditor.Existing)?.table
    val key = existing?.let { "t-${it.id}-${it.version}" } ?: "t-new"
    var name by rememberSaveable(key) { mutableStateOf(existing?.name.orEmpty()) }
    var capacity by rememberSaveable(key) { mutableIntStateOf(existing?.capacity ?: 4) }
    var areaId by rememberSaveable(key) { mutableStateOf(existing?.areaId ?: (editor as? TableEditor.New)?.areaId) }
    val editable = existing == null || access.update
    val changed = existing == null || name.trim() != existing.name || capacity != existing.capacity || areaId != existing.areaId
    val valid = name.isNotBlank()
    val hasOrder = existing?.activeOrder != null
    val sortedAreas = areas.sortedWith(compareBy({ it.sortOrder }, { it.name.lowercase() }))

    BistroSheet(
        title = existing?.let { "Table ${it.name}" } ?: "New table",
        subtitle = existing?.let { "${it.capacity} seats · ${it.areaName ?: "No area"}" } ?: "Name it the way staff say it, e.g. 12 or T4.",
        onDismiss = vm::closeEditor,
        actions = {
            val save: @Composable () -> Unit = {
                BistroButton(
                    if (existing == null) "Add table" else "Save", { vm.saveTable(name, capacity, areaId) },
                    modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                    enabled = valid && changed, loading = vm.working == "table",
                )
            }
            val remove: @Composable () -> Unit = {
                BistroButton(
                    "Remove", { vm.deleteTarget = existing }, style = ButtonStyle.Danger, icon = Icons.Rounded.DeleteOutline,
                    enabled = !hasOrder, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                )
            }
            when {
                existing != null && access.delete && editable -> ActionPair(secondary = remove, primary = save)
                existing != null && access.delete -> remove()
                editable -> save()
            }
        },
    ) {
        if (hasOrder && access.delete) {
            NoticeCard("This table has an open order, so it can't be removed. Close or move the order first.", icon = Icons.Rounded.Lock)
            Gap(Spacing.md)
        }
        if (!editable) {
            NoticeCard("You can remove tables but not change them.", icon = Icons.Rounded.Lock)
            Gap(Spacing.md)
        }
        BistroTextField(
            name, { name = it.take(20) }, "Table name", Modifier.fillMaxWidth(),
            enabled = editable, error = vm.errors["name"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        )
        Gap(Spacing.md)
        Row(
            Modifier.fillMaxWidth().clip(Radii.lg).background(BistroTheme.colors.surfaceSunken).padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Groups, null, tint = BistroTheme.colors.textSecondary)
            Text("Seats", style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary, modifier = Modifier.weight(1f).padding(start = Spacing.md))
            if (editable) {
                QuantityStepper(capacity, { capacity = it }, min = 1, max = 50, label = "Seats")
            } else {
                Text("$capacity", style = BistroTheme.type.amountLarge, color = BistroTheme.colors.textPrimary)
            }
        }
        vm.errors["capacity"]?.let { Text(it, style = BistroTheme.type.metadata, color = BistroTheme.colors.danger) }
        Gap(Spacing.md)
        Text("Area", style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary)
        Gap(Spacing.xs)
        if (editable) {
            val options: List<Int?> = listOf<Int?>(null) + sortedAreas.map { it.id }
            ChipRow(options, areaId, { areaId = it }, { id -> sortedAreas.firstOrNull { it.id == id }?.name ?: "No area" }, edgePadding = 0.dp)
            if (sortedAreas.isEmpty()) {
                Text("Add areas from the Tables screen to group tables.", style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary)
            }
        } else {
            Text(sortedAreas.firstOrNull { it.id == areaId }?.name ?: "No area", style = BistroTheme.type.body, color = BistroTheme.colors.textSecondary)
        }
        Gap(Spacing.md)
    }
}

@Composable
private fun AddAreaSheet(vm: TablesManageViewModel) {
    var name by rememberSaveable { mutableStateOf("") }
    BistroSheet(
        title = "Add area",
        subtitle = "e.g. Terrace, Bar, Private room",
        onDismiss = { if (vm.working == null) vm.addingArea = false },
        actions = {
            BistroButton(
                "Add area", { vm.addArea(name) }, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                enabled = name.isNotBlank(), loading = vm.working == "area",
            )
        },
    ) {
        BistroTextField(
            name, { name = it.take(60) }, "Area name", Modifier.fillMaxWidth(), error = vm.errors["name"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.md)
    }
}

@Composable
private fun TablesSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 120.dp)
        Skeleton(Modifier.fillMaxWidth(0.3f), 16.dp)
        repeat(5) { Skeleton(Modifier.fillMaxWidth(), 60.dp) }
    }
}
