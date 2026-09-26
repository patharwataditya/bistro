package ai.synkrasis.bistro.feature.kitchen

import ai.synkrasis.bistro.core.designsystem.component.BistroTopBar
import ai.synkrasis.bistro.core.designsystem.component.CountBadge
import ai.synkrasis.bistro.core.designsystem.component.EmptyState
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.SegmentedControl
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.component.StaleBanner
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.ui.CollectEffects
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.ui.PollWhileVisible
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.data.api.Ticket
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.time.Instant

private val WIDE_BREAKPOINT = 600.dp
private val MIN_LANE_WIDTH = 300.dp

@Composable
fun KitchenScreen() {
    val vm = bistroViewModel { KitchenViewModel(it) }
    val session = LocalSession.current
    CollectEffects(vm.effects.flow)
    PollWhileVisible(4_000) { vm.refresh() }

    // Timers tick every second on server time, without refetching.
    val now = remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(vm) {
        while (true) {
            now.value = vm.clock.now()
            delay(1_000)
        }
    }

    val tickets = (vm.state as? LoadState.Ready)?.data
    // "Recently served" is looked at rarely; it's a toggle instead of a permanent fourth lane,
    // which keeps the three working lanes wide enough to read on phones and portrait tablets.
    var showDone by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        BistroTopBar(
            title = if (showDone) "Recently served" else "Kitchen",
            eyebrow = session.me.location.name,
            subtitle = tickets?.let { summary(it) },
            actions = {
                ai.synkrasis.bistro.core.designsystem.component.BistroIconButton(
                    if (showDone) androidx.compose.material.icons.Icons.Rounded.Close else androidx.compose.material.icons.Icons.Rounded.History,
                    if (showDone) "Back to the board" else "Show recently served",
                    {
                        showDone = !showDone
                        vm.lane = if (showDone) Lane.Done else Lane.New
                    },
                )
            },
        )
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= WIDE_BREAKPOINT
            when (val s = vm.state) {
                LoadState.Loading -> KitchenSkeleton(wide)
                is LoadState.Failed -> ErrorState(s.error, vm::refreshNow, Modifier.fillMaxSize())
                is LoadState.Ready -> if (wide && !showDone) {
                    LaneColumns(s.data, s.staleError, now, vm, maxWidth)
                } else {
                    PhoneBoard(s.data, s.staleError, now, vm, showDone)
                }
            }
        }
    }
}

private fun summary(tickets: List<Ticket>): String {
    val new = tickets.count { it.lane == Lane.New }
    val cooking = tickets.count { it.lane == Lane.Preparing }
    val ready = tickets.count { it.lane == Lane.Ready }
    return "$new new · $cooking cooking · $ready ready"
}

@Composable
private fun PhoneBoard(tickets: List<Ticket>, staleError: AppError?, now: State<Instant>, vm: KitchenViewModel, showDone: Boolean) {
    Column(Modifier.fillMaxSize()) {
        if (!showDone) SegmentedControl(
            options = Lane.entries.filter { it != Lane.Done },
            selected = vm.lane,
            onSelect = { vm.lane = it },
            label = { it.label },
            badge = { lane -> tickets.count { it.lane == lane } },
            modifier = Modifier.padding(horizontal = Spacing.gutter),
        )
        StaleBanner(staleError, Modifier.padding(horizontal = Spacing.gutter, vertical = Spacing.xs))
        LaneList(
            lane = vm.lane,
            tickets = tickets.inLane(vm.lane),
            now = now,
            vm = vm,
            contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, top = Spacing.md, bottom = Spacing.xxxl),
        )
    }
}

@Composable
private fun LaneColumns(tickets: List<Ticket>, staleError: AppError?, now: State<Instant>, vm: KitchenViewModel, width: Dp) {
    val lanes = Lane.entries.filter { it != Lane.Done }
    val available = width - Spacing.gutter * 2 - Spacing.md * (lanes.size - 1)
    val laneWidth = maxOf(MIN_LANE_WIDTH, available / lanes.size)
    Column(Modifier.fillMaxSize()) {
        StaleBanner(staleError, Modifier.padding(horizontal = Spacing.gutter, vertical = Spacing.xs))
        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.gutter),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(lanes, key = { it.name }) { lane ->
                val inLane = tickets.inLane(lane)
                Column(
                    Modifier.width(laneWidth).fillMaxHeight().clip(Radii.lg)
                        .background(BistroTheme.colors.surfaceSunken),
                ) {
                    LaneHeader(lane, inLane.size)
                    LaneList(
                        lane = lane,
                        tickets = inLane,
                        now = now,
                        vm = vm,
                        contentPadding = PaddingValues(start = Spacing.sm, end = Spacing.sm, bottom = Spacing.xxxl),
                    )
                }
            }
        }
    }
}

@Composable
private fun LaneHeader(lane: Lane, count: Int) {
    val c = BistroTheme.colors
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.md).semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Icon(lane.icon, null, tint = c.textSecondary)
        Text(lane.label, style = BistroTheme.type.sectionTitle, color = c.textPrimary, modifier = Modifier.weight(1f))
        CountBadge(count, if (count > 0 && lane != Lane.Done) Tone.Accent else Tone.Neutral)
    }
}

@Composable
private fun LaneList(
    lane: Lane,
    tickets: List<Ticket>,
    now: State<Instant>,
    vm: KitchenViewModel,
    contentPadding: PaddingValues,
) {
    val session = LocalSession.current
    val haptics = LocalHaptics.current
    val canUpdate = session.can(Permission.KITCHEN_UPDATE)
    LazyColumn(
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        modifier = Modifier.fillMaxSize(),
    ) {
        if (tickets.isEmpty()) {
            item(key = "empty-${lane.name}") {
                EmptyState(lane.icon, lane.emptyTitle, lane.emptyMessage, Modifier.animateItem())
            }
        }
        items(tickets, key = { it.id }) { ticket ->
            TicketCard(
                ticket = ticket,
                now = { now.value },
                zone = session.zone,
                canUpdate = canUpdate,
                busy = ticket.id in vm.busy,
                onAction = { action ->
                    haptics.perform(Haptic.Confirm)
                    vm.transition(ticket, action.to)
                },
                modifier = Modifier.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast()),
            )
        }
    }
}

@Composable
private fun KitchenSkeleton(wide: Boolean) {
    if (!wide) {
        Column(Modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Skeleton(Modifier.fillMaxWidth(), 44.dp)
            repeat(3) { Skeleton(Modifier.fillMaxWidth(), 200.dp) }
        }
        return
    }
    Row(Modifier.fillMaxSize().padding(Spacing.gutter), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
        repeat(Lane.entries.size) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Skeleton(Modifier.fillMaxWidth(), 40.dp)
                repeat(2) { Skeleton(Modifier.fillMaxWidth(), 200.dp) }
            }
        }
    }
}
