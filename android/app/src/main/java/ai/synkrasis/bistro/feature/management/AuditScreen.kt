package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.SkeletonList
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.ApiResult
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.core.ui.dataOrNull
import ai.synkrasis.bistro.core.ui.markRefreshing
import ai.synkrasis.bistro.core.ui.reduce
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.AuditEntry
import ai.synkrasis.bistro.navigation.LocalNavigator
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Receipt
import androidx.compose.material.icons.rounded.RestaurantMenu
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.time.Instant

/** Filter by action prefix, as the API's `action` parameter expects. */
enum class AuditFilter(val label: String, val prefix: String?) {
    All("All", null),
    Orders("Orders", "order."),
    Billing("Billing", "bill."),
    Payments("Payments", "payment."),
    Staff("Staff", "staff."),
    Roles("Roles", "role."),
    Menu("Menu", "menu."),
    Settings("Settings", "settings."),
    Tables("Tables", "table."),
}

class AuditViewModel(private val container: AppContainer) : ActionViewModel() {
    var filter by mutableStateOf(AuditFilter.All)
        private set
    var state by mutableStateOf<LoadState<List<AuditEntry>>>(LoadState.Loading)
        private set
    /** Cursor for the next (older) page; null once everything has been loaded. */
    var nextBeforeId by mutableStateOf<Int?>(null)
        private set
    var loadingMore by mutableStateOf(false)
        private set
    var moreError by mutableStateOf<AppError?>(null)
        private set
    var expanded by mutableStateOf<Set<Int>>(emptySet())
        private set

    private val lock = Mutex()

    /** Newest page. With entries already shown, new ones are prepended so older pages stay loaded. */
    override suspend fun refresh() = lock.withLock {
        val requested = filter
        state = state.markRefreshing()
        val result = container.insights.audit(null, requested.prefix)
        if (requested != filter) return@withLock
        val current = state.dataOrNull
        if (result is ApiResult.Success && current != null && current.isNotEmpty()) {
            val newestId = current.first().id
            val page = result.value.items
            if (page.any { it.id <= newestId }) {
                state = LoadState.Ready(page.filter { it.id > newestId } + current)
                return@withLock
            }
        }
        state = state.reduce(
            when (result) {
                is ApiResult.Success -> ApiResult.Success(result.value.items)
                is ApiResult.Failure -> result
            },
        )
        if (result is ApiResult.Success) nextBeforeId = result.value.nextBeforeId
    }

    fun select(f: AuditFilter) {
        if (f == filter) return
        filter = f
        state = LoadState.Loading
        nextBeforeId = null
        moreError = null
        expanded = emptySet()
        viewModelScope.launch { refresh() }
    }

    fun loadMore() {
        val cursor = nextBeforeId ?: return
        if (loadingMore || state !is LoadState.Ready) return
        val requested = filter
        loadingMore = true
        moreError = null
        viewModelScope.launch {
            val result = container.insights.audit(cursor, requested.prefix)
            if (requested == filter) {
                when (result) {
                    is ApiResult.Success -> {
                        val current = state.dataOrNull.orEmpty()
                        val known = current.mapTo(HashSet()) { it.id }
                        state = LoadState.Ready(current + result.value.items.filter { it.id !in known })
                        nextBeforeId = result.value.nextBeforeId
                    }
                    is ApiResult.Failure -> moreError = result.error
                }
            }
            loadingMore = false
        }
    }

    fun toggle(id: Int) {
        expanded = if (id in expanded) expanded - id else expanded + id
    }
}

@Composable
fun AuditScreen() {
    val vm = bistroViewModel(key = "audit") { AuditViewModel(it) }
    val navigator = LocalNavigator.current
    CollectEffects(vm.effects.flow, onNavigate = navigator::open, onBack = navigator::back)
    PollWhileVisible(30_000) { vm.refresh() }
    Column(Modifier.fillMaxSize()) {
        BistroTopBar("Activity log", subtitle = "Who did what, and when", onBack = navigator::back)
        ChipRow(AuditFilter.entries, vm.filter, vm::select, { it.label }, Modifier.padding(bottom = Spacing.sm))
        when (val s = vm.state) {
            LoadState.Loading -> SkeletonList(rows = 8, rowHeight = 64.dp)
            is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
            is LoadState.Ready -> AuditList(s.data, s.staleError, vm)
        }
    }
}

@Composable
private fun AuditList(entries: List<AuditEntry>, staleError: AppError?, vm: AuditViewModel) {
    val listState = rememberLazyListState()
    // Fetch the next page when the last few rows come into view.
    LaunchedEffect(listState, vm) {
        snapshotFlow {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= info.totalItemsCount - 4
        }.distinctUntilChanged().filter { it }.collect { vm.loadMore() }
    }
    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, bottom = Spacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "stale") { StaleBanner(staleError) }
        if (entries.isEmpty()) {
            item(key = "empty") {
                EmptyState(
                    Icons.Rounded.History,
                    if (vm.filter == AuditFilter.All) "Nothing recorded yet" else "No ${vm.filter.label.lowercase()} activity",
                    if (vm.filter == AuditFilter.All) {
                        "Important actions (voids, refunds, price and access changes) are logged here."
                    } else {
                        "Nothing in this category yet. Try All to see everything."
                    },
                )
            }
        }
        items(entries, key = { it.id }) { entry ->
            AuditRow(entry, entry.id in vm.expanded, { vm.toggle(entry.id) }, Modifier.itemMotion(this))
        }
        item(key = "footer") { AuditFooter(entries.isNotEmpty(), vm) }
    }
}

@Composable
private fun AuditFooter(hasEntries: Boolean, vm: AuditViewModel) {
    val error = vm.moreError
    when {
        vm.loadingMore -> Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            repeat(2) { Skeleton(Modifier.fillMaxWidth(), 64.dp) }
        }
        error != null -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(error.message, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
            Gap(Spacing.sm)
            BistroButton("Load more", vm::loadMore, style = ButtonStyle.Secondary)
        }
        vm.nextBeforeId == null && hasEntries -> Text(
            "That's the beginning of the log.",
            style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary,
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.md),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

private data class AuditKind(val icon: ImageVector, val tone: Tone)

private fun kindOf(entry: AuditEntry): AuditKind = when {
    entry.action.startsWith("payment.") -> AuditKind(Icons.Rounded.Payments, Tone.Success)
    entry.action.startsWith("bill.") -> AuditKind(Icons.Rounded.Receipt, Tone.Accent)
    else -> when (entry.entityType) {
        "order" -> AuditKind(Icons.AutoMirrored.Rounded.ReceiptLong, Tone.Info)
        "bill" -> AuditKind(Icons.Rounded.Receipt, Tone.Accent)
        "user" -> AuditKind(Icons.Rounded.Person, Tone.Warning)
        "role" -> AuditKind(Icons.Rounded.AdminPanelSettings, Tone.Warning)
        "menu_item", "menu_category" -> AuditKind(Icons.Rounded.RestaurantMenu, Tone.Cleaning)
        "table", "table_area" -> AuditKind(Icons.Rounded.TableRestaurant, Tone.Info)
        "location", "payment_method" -> AuditKind(Icons.Rounded.Settings, Tone.Neutral)
        else -> AuditKind(Icons.Rounded.History, Tone.Neutral)
    }
}

@Composable
private fun AuditRow(entry: AuditEntry, expanded: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    val kind = kindOf(entry)
    val tone = kind.tone.colors()
    val hasDetails = entry.metadata.isNotEmpty() || entry.entityId != null
    BistroCard(
        modifier.fillMaxWidth().semantics { stateDescription = if (expanded) "Expanded" else "Collapsed" },
        onClick = {
            haptics.perform(Haptic.Selection)
            onToggle()
        },
        onClickLabel = if (expanded) "Hide details" else "Show details",
        elevated = false,
        contentPadding = PaddingValues(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Box(Modifier.size(36.dp).clip(Radii.sm).background(tone.container), contentAlignment = Alignment.Center) {
                Icon(kind.icon, null, tint = tone.content, modifier = Modifier.size(18.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(entry.summary, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
                Text(
                    "${entry.actorName ?: "System"} · ${Format.relative(entry.createdAt, Instant.now(), session.zone)}",
                    style = BistroTheme.type.metadata, color = c.textSecondary,
                )
            }
            if (hasDetails) {
                Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null, tint = c.textTertiary)
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(Motion.standard()) + fadeIn(Motion.standard()),
            exit = shrinkVertically(Motion.fast()) + fadeOut(Motion.fast()),
        ) {
            Column(Modifier.padding(top = Spacing.sm)) {
                HairlineDivider()
                DetailLine("When", Format.dateTime(entry.createdAt, session.zone))
                DetailLine("Action", entry.action)
                entry.entityId?.let { DetailLine(entry.entityType.humanize(), "#$it") }
                entry.metadata.forEach { (key, value) -> DetailLine(key.humanize(), value.display()) }
            }
        }
    }
}

private fun JsonElement.display(): String = when (this) {
    is JsonPrimitive -> contentOrNull ?: "—"
    is JsonArray -> if (isEmpty()) "—" else joinToString { it.display() }
    is JsonObject -> if (isEmpty()) "—" else entries.joinToString { "${it.key.humanize()}: ${it.value.display()}" }
}
