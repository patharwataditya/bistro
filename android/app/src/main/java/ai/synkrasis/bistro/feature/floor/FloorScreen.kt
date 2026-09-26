package ai.synkrasis.bistro.feature.floor

import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.data.api.DiningTable
import ai.synkrasis.bistro.data.api.Floor
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import ai.synkrasis.bistro.navigation.TablesManageRoute
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.time.Instant

@Composable
fun FloorScreen() {
    val vm = bistroViewModel { FloorViewModel(it) }
    val navigator = LocalNavigator.current
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open)
    PollWhileVisible(5_000) { vm.refresh() }

    // Elapsed times tick on server time without refetching.
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = vm.clock.now()
            delay(15_000)
        }
    }

    val floor = (vm.state as? LoadState.Ready)?.data
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = "Floor",
            eyebrow = session.me.location.name,
            subtitle = floor?.let { f ->
                val free = f.tables.count { it.status == TableStatus.Available }
                "$free of ${f.tables.size} tables free"
            },
            actions = {
                if (session.can(Permission.TABLES_UPDATE) || session.can(Permission.TABLES_CREATE)) {
                    BistroIconButton(Icons.Rounded.Tune, "Manage tables", { navigator.open(TablesManageRoute) })
                }
            },
        )
        when (val s = vm.state) {
            LoadState.Loading -> FloorSkeleton()
            is LoadState.Failed -> ErrorState(s.error, onRetry = vm::refreshNow, modifier = Modifier.fillMaxSize())
            is LoadState.Ready -> PullToRefreshBox(
                isRefreshing = vm.pulling,
                onRefresh = vm::pullToRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                FloorContent(
                    floor = s.data,
                    now = now,
                    vm = vm,
                    staleError = s.staleError,
                    onTap = { table ->
                        haptics.perform(Haptic.Selection)
                        vm.onTableTapped(table, session.can(Permission.ORDERS_CREATE))
                    },
                    onLongPress = { table ->
                        haptics.perform(Haptic.LongPress)
                        vm.actionsForId = table.id
                    },
                )
            }
        }
    }

    vm.seatDraft?.let { draft ->
        SeatGuestsSheet(
            draft = draft,
            busy = vm.busy,
            onGuestsChange = { vm.seatDraft = draft.copy(guests = it, key = ai.synkrasis.bistro.core.network.IdempotencyKeys.new()) },
            onConfirm = vm::openTable,
            onDismiss = { vm.seatDraft = null },
        )
    }
    vm.actionsFor?.let { table ->
        TableActionsSheet(
            table = table,
            canManage = session.can(Permission.TABLES_MANAGE_STATUS),
            canSeat = session.can(Permission.ORDERS_CREATE),
            busy = vm.busy,
            onSetStatus = { status, note -> vm.setStatus(table, status, note) },
            onSeat = {
                vm.actionsForId = null
                vm.seatDraft = SeatDraft(table, table.capacity.coerceAtMost(2).coerceAtLeast(1))
            },
            onOpenOrder = {
                vm.actionsForId = null
                table.activeOrder?.let { vm.onTableTapped(table, false) }
            },
            onDismiss = { vm.actionsForId = null },
        )
    }
}

@Composable
private fun FloorContent(
    floor: Floor,
    now: Instant,
    vm: FloorViewModel,
    staleError: ai.synkrasis.bistro.core.network.AppError?,
    onTap: (DiningTable) -> Unit,
    onLongPress: (DiningTable) -> Unit,
) {
    val areaOptions = remember(floor.areas, floor.tables) {
        buildList {
            add(AreaFilter.All)
            floor.areas.forEach { add(AreaFilter.One(it.id, it.name)) }
            if (floor.tables.any { it.areaId == null }) add(AreaFilter.One(null, "Unassigned"))
        }
    }
    val visible = floor.tables.filter { t ->
        (vm.area == AreaFilter.All || (vm.area as AreaFilter.One).id == t.areaId) &&
            (vm.statusFilter == null || t.status == vm.statusFilter)
    }
    // Group by area in the "All" view so the grid reads like the room.
    // (key, title, tables). Keys use the area id, never the name: names aren't unique keys.
    val groups: List<Triple<String, String?, List<DiningTable>>> = if (vm.area == AreaFilter.All) {
        val order = floor.areas.associate { it.id to it.sortOrder }
        visible.groupBy { it.areaId }.toList()
            .sortedBy { (id, _) -> order[id] ?: Int.MAX_VALUE }
            .map { (id, tables) -> Triple("area-${id ?: "none"}", floor.areas.firstOrNull { it.id == id }?.name ?: "Unassigned", tables) }
    } else {
        listOf(Triple("area-filtered", null, visible))
    }

    // Two columns on a 360dp phone at normal text size; with large text the columns widen
    // (possibly to one) rather than truncating table names and statuses.
    val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale.coerceIn(1f, 1.6f)
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 144.dp * fontScale),
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = Spacing.xxxl),
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, key = "stale") { StaleBanner(staleError) }
        item(span = { GridItemSpan(maxLineSpan) }, key = "summary") {
            StatusSummary(floor.tables, vm.statusFilter) { vm.statusFilter = if (vm.statusFilter == it) null else it }
        }
        if (areaOptions.size > 2) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "areas") {
                ChipRow(areaOptions, vm.area, { vm.area = it }, { if (it is AreaFilter.One) it.name else "All areas" }, edgePadding = 0.dp)
            }
        }
        if (visible.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "empty") {
                EmptyState(
                    icon = Icons.Rounded.TableRestaurant,
                    title = if (floor.tables.isEmpty()) "No tables yet" else "No tables match",
                    message = if (floor.tables.isEmpty()) {
                        "Add your tables and areas to start seating guests."
                    } else {
                        "Nothing here right now. Clear the filter to see every table."
                    },
                )
            }
        }
        groups.forEach { (key, title, tables) ->
            if (title != null && groups.size > 1) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "h-$key") {
                    Text(
                        title.uppercase(), style = BistroTheme.type.statusLabel, color = BistroTheme.colors.textTertiary,
                        modifier = Modifier.padding(top = Spacing.sm).animateItem(),
                    )
                }
            }
            items(tables, key = { it.id }) { table ->
                TableCard(
                    table = table, now = now, onTap = { onTap(table) }, onLongPress = { onLongPress(table) },
                    modifier = Modifier.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
                )
            }
        }
    }
}

/** Counts per status; tapping one filters the floor to it (and tapping again clears). */
@Composable
private fun StatusSummary(tables: List<DiningTable>, selected: TableStatus?, onSelect: (TableStatus) -> Unit) {
    val statuses = listOf(TableStatus.Available, TableStatus.Occupied, TableStatus.Reserved, TableStatus.Cleaning, TableStatus.Blocked)
    val haptics = LocalHaptics.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        statuses.forEach { status ->
            val count = tables.count { it.status == status }
            val v = status.visual
            val tone = v.tone.colors()
            val isSelected = selected == status
            val bg by animateColorAsState(if (isSelected) tone.content else tone.container, Motion.fast(), label = "sum-bg")
            val fg by animateColorAsState(if (isSelected) BistroTheme.colors.surface else tone.content, Motion.fast(), label = "sum-fg")
            Column(
                Modifier.weight(1f).clip(Radii.md).background(bg)
                    .clickable(role = Role.Tab) {
                        haptics.perform(Haptic.Selection)
                        onSelect(status)
                    }
                    .padding(vertical = Spacing.sm)
                    .clearAndSetSemantics {
                        contentDescription = "${v.label}: $count"
                        this.selected = isSelected
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(v.icon, null, tint = fg, modifier = Modifier.size(16.dp))
                Text("$count", style = BistroTheme.type.amountLarge, color = fg)
                Text(v.label, style = BistroTheme.type.metadata.copy(fontSize = BistroTheme.type.statusLabel.fontSize), color = fg, maxLines = 1)
            }
        }
    }
}

@Composable
private fun FloorSkeleton() {
    Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        Skeleton(Modifier.fillMaxWidth(), 64.dp)
        repeat(4) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Skeleton(Modifier.weight(1f), 132.dp)
                Skeleton(Modifier.weight(1f), 132.dp)
            }
        }
    }
}

