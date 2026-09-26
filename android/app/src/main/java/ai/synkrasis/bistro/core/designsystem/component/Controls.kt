package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp

/** Segmented control with a sliding indicator (appearance picker, kitchen lanes, filters). */
@Composable
fun <T> SegmentedControl(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    badge: ((T) -> Int?)? = null,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val index = options.indexOf(selected).coerceAtLeast(0)
    BoxWithConstraints(
        modifier.fillMaxWidth().height(48.dp).clip(Radii.md).background(c.surfaceSunken).padding(3.dp),
    ) {
        val segment = maxWidth / options.size
        val offset by animateDpAsState(segment * index, Motion.standard(), label = "seg")
        Box(
            Modifier.offset { androidx.compose.ui.unit.IntOffset(offset.roundToPx(), 0) }.width(segment).fillMaxHeight().clip(Radii.sm)
                .background(if (c.isDark) c.surfaceRaised else c.surface)
                .border(1.dp, c.border, Radii.sm),
        )
        Row(Modifier.fillMaxWidth().fillMaxHeight().selectableGroup()) {
            options.forEach { option ->
                val isSelected = option == selected
                val color by animateColorAsState(if (isSelected) c.textPrimary else c.textSecondary, Motion.fast(), label = "seg-c")
                Row(
                    Modifier.weight(1f).fillMaxHeight().clip(Radii.sm)
                        .selectable(isSelected, role = Role.Tab, onClick = {
                            if (!isSelected) {
                                haptics.perform(Haptic.Selection)
                                onSelect(option)
                            }
                        }),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label(option), style = BistroTheme.type.button.copy(fontSize = BistroTheme.type.supporting.fontSize), color = color, maxLines = 1)
                    val count = badge?.invoke(option)
                    if (count != null && count > 0) {
                        Box(Modifier.padding(start = 6.dp)) { CountBadge(count, if (isSelected) Tone.Accent else Tone.Neutral) }
                    }
                }
            }
        }
    }
}

/** Horizontally scrolling filter chips (areas, categories). */
@Composable
fun <T> ChipRow(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    edgePadding: androidx.compose.ui.unit.Dp = Spacing.gutter,
) {
    val haptics = LocalHaptics.current
    Row(
        modifier.horizontalScroll(rememberScrollState()).padding(horizontal = edgePadding).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            val c = BistroTheme.colors
            val bg by animateColorAsState(if (isSelected) c.ink else c.surface, Motion.fast(), label = "chip-bg")
            val fg by animateColorAsState(if (isSelected) c.onInk else c.textPrimary, Motion.fast(), label = "chip-fg")
            Box(
                Modifier.height(48.dp).clip(Radii.pill).background(bg)
                    .border(1.dp, if (isSelected) Color.Transparent else c.border, Radii.pill)
                    .selectable(isSelected, role = Role.Tab) {
                        if (!isSelected) {
                            haptics.perform(Haptic.Selection)
                            onSelect(option)
                        }
                    }
                    .padding(horizontal = Spacing.lg),
                contentAlignment = Alignment.Center,
            ) {
                Text(label(option), style = BistroTheme.type.button.copy(fontSize = BistroTheme.type.supporting.fontSize), color = fg)
            }
        }
    }
}

/** Quantity stepper. The number rolls in the direction of change. */
@Composable
fun QuantityStepper(
    value: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    min: Int = 0,
    max: Int = 999,
    label: String = "Quantity",
    compact: Boolean = false,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val size = if (compact) 40.dp else 48.dp
    Row(
        modifier.clip(Radii.pill).background(c.surfaceSunken).padding(3.dp)
            .semantics(mergeDescendants = false) { stateDescription = "$label $value" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperButton(Icons.Rounded.Remove, "Decrease $label", value > min, size) {
            haptics.perform(Haptic.Selection)
            onChange(value - 1)
        }
        AnimatedContent(
            targetState = value,
            transitionSpec = {
                val up = targetState > initialState
                (slideInVertically(Motion.fast()) { if (up) it else -it } + fadeIn(Motion.fast())) togetherWith
                    (slideOutVertically(Motion.fast()) { if (up) -it else it } + fadeOut(Motion.fast()))
            },
            label = "qty",
        ) { v ->
            Text(
                "$v", style = BistroTheme.type.amount, color = c.textPrimary,
                modifier = Modifier.width(if (compact) 28.dp else 36.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
        StepperButton(Icons.Rounded.Add, "Increase $label", value < max, size) {
            haptics.perform(Haptic.Selection)
            onChange(value + 1)
        }
    }
}

@Composable
private fun StepperButton(icon: ImageVector, description: String, enabled: Boolean, size: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    val c = BistroTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier.minimumInteractiveComponentSize().size(size).pressScale(interaction, 0.88f).clip(Radii.pill)
            .background(if (enabled) c.surface else Color.Transparent)
            .clickable(interaction, androidx.compose.material3.ripple(), enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = if (enabled) c.textPrimary else c.textDisabled, modifier = Modifier.size(18.dp))
    }
}

/** A number that rolls to its new value instead of snapping (dashboard metrics, totals). */
@Composable
fun AnimatedCounter(text: String, style: TextStyle, color: Color, modifier: Modifier = Modifier) {
    AnimatedContent(
        targetState = text,
        transitionSpec = {
            (slideInVertically(Motion.standard()) { it / 2 } + fadeIn(Motion.standard())) togetherWith
                (slideOutVertically(Motion.fast()) { -it / 2 } + fadeOut(Motion.fast()))
        },
        modifier = modifier,
        label = "counter",
    ) { Text(it, style = style, color = color, maxLines = 1) }
}

/** Selectable row with a trailing switch-like state, for settings lists. */
@Composable
fun ToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    val haptics = LocalHaptics.current
    Row(
        modifier.fillMaxWidth().clip(Radii.md)
            .toggleable(value = checked, role = Role.Switch) {
                haptics.perform(Haptic.Toggle)
                onCheckedChange(it)
            }
            .padding(vertical = Spacing.md, horizontal = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
            Text(title, style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary)
            if (subtitle != null) Text(subtitle, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
        }
        androidx.compose.material3.Switch(
            checked = checked,
            onCheckedChange = null,
            colors = androidx.compose.material3.SwitchDefaults.colors(
                checkedTrackColor = BistroTheme.colors.success,
                checkedThumbColor = BistroTheme.colors.surface,
                uncheckedTrackColor = BistroTheme.colors.surfaceSunken,
                uncheckedBorderColor = BistroTheme.colors.borderStrong,
            ),
        )
    }
}

/** Horizontal scroll helper kept here so feature code doesn't import scroll internals. */
@Composable
fun Modifier.horizontalScrollable(): Modifier = this.horizontalScroll(rememberScrollState())
