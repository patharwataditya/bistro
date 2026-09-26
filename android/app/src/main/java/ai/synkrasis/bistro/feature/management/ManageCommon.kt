package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
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
import ai.synkrasis.bistro.core.ui.Effects
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/*
 * Pieces shared by the management screens (staff, roles, settings, audit, menu, tables).
 * Everything here is built from design-system tokens; nothing hardcodes colour or type.
 */

/**
 * Base for screens that load one thing and run one action at a time. [working] names the
 * action in flight so its button can spin and every other action is ignored until it lands.
 */
abstract class ActionViewModel : ViewModel() {
    val effects = Effects()

    var working by mutableStateOf<String?>(null)
        private set

    abstract suspend fun refresh()

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    /**
     * Runs [block] unless another action is running. Failures are toasted; when the server
     * says our copy is out of date (stale / invalid state / gone) the data is reloaded.
     */
    protected fun <T> act(
        tag: String,
        block: suspend () -> ApiResult<T>,
        onFailure: (AppError) -> Unit = {},
        onSuccess: suspend (T) -> Unit = {},
    ) {
        if (working != null) return
        working = tag
        viewModelScope.launch {
            when (val result = block()) {
                is ApiResult.Success -> onSuccess(result.value)
                is ApiResult.Failure -> {
                    val error = result.error
                    effects.error(error.message)
                    onFailure(error)
                    if (error is AppError.Stale || error is AppError.InvalidState || error is AppError.NotFound) refresh()
                }
            }
            working = null
        }
    }
}

/** Server field errors keyed by snake_case field path ("timezone", "tax_rates.0.rate_percent"). */
fun AppError.fieldErrors(): Map<String, String> =
    (this as? AppError.Validation)?.fields?.mapValues { (_, msg) -> msg.removePrefix("Value error, ") } ?: emptyMap()

/** Mirrors the server's password rule: ≥ 8 characters, not only letters or only digits, no edge spaces. */
object PasswordRules {
    fun problem(password: String): String? = when {
        password.length < 8 -> "At least 8 characters (${8 - password.length} more)"
        password.trim() != password -> "Can't start or end with a space"
        password.all { it.isDigit() } || password.all { it.isLetter() } -> "Mix letters with numbers or symbols"
        else -> null
    }

    fun hint(password: String): String =
        if (password.isEmpty()) "At least 8 characters, mixing letters with numbers or symbols" else problem(password) ?: "Looks good"
}

fun String.humanize(): String = replace('_', ' ').replace('.', ' ').trim()
    .replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

/** Standard enter/exit/move animation for lazy list rows. */
fun Modifier.itemMotion(scope: LazyItemScope): Modifier = with(scope) {
    this@itemMotion.animateItem(fadeInSpec = Motion.standard(), placementSpec = Motion.placement, fadeOutSpec = Motion.fast())
}

/** Short explanation box: why something is read-only, what a setting does. */
@Composable
fun NoticeCard(text: String, modifier: Modifier = Modifier, icon: ImageVector = Icons.Rounded.Info, tone: Tone = Tone.Neutral) {
    val colors = tone.colors()
    Row(
        modifier.fillMaxWidth().clip(Radii.md).background(colors.container)
            .padding(horizontal = Spacing.md, vertical = Spacing.md),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Icon(icon, null, tint = colors.content, modifier = Modifier.size(18.dp))
        Text(text, style = BistroTheme.type.supporting, color = BistroTheme.colors.textPrimary)
    }
}

/** Small uppercase heading used inside sheets and lists. */
@Composable
fun GroupLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(), style = BistroTheme.type.statusLabel, color = BistroTheme.colors.textTertiary,
        modifier = modifier.padding(top = Spacing.md, bottom = Spacing.xs).semantics { heading() },
    )
}

/** Pinned bottom bar that appears only when a form has unsaved changes. */
@Composable
fun StickySaveBar(
    visible: Boolean,
    loading: Boolean,
    onSave: () -> Unit,
    onDiscard: () -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Save changes",
    enabled: Boolean = true,
    message: String = "Unsaved changes",
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(Motion.enter()) { it } + fadeIn(Motion.enter()),
        exit = slideOutVertically(Motion.exit()) { it } + fadeOut(Motion.exit()),
        modifier = modifier,
    ) {
        Column(Modifier.fillMaxWidth().background(c.background).navigationBarsPadding()) {
            Box(Modifier.fillMaxWidth().padding(bottom = Spacing.xs).background(c.border).heightIn(min = 1.dp, max = 1.dp))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                Text(message, style = BistroTheme.type.supporting, color = c.textSecondary, modifier = Modifier.weight(1f))
                BistroButton("Discard", onDiscard, style = ButtonStyle.Ghost, enabled = !loading)
                BistroButton(
                    label,
                    {
                        haptics.perform(Haptic.Confirm)
                        onSave()
                    },
                    style = ButtonStyle.Accent, size = ButtonSize.Medium, loading = loading, enabled = enabled,
                )
            }
        }
    }
}

/** Initials in a tinted circle. */
@Composable
fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 44.dp, muted: Boolean = false) {
    val tone = (if (muted) Tone.Neutral else Tone.Accent).colors()
    val initials = name.split(' ', '-', '.').filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    Box(
        modifier.size(size).clip(CircleShape).background(tone.container).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, style = BistroTheme.type.cardTitle, color = tone.content, maxLines = 1)
    }
}

/** Multi-select chip (role pickers). Disabled chips explain themselves through [note]. */
@Composable
fun SelectChip(
    label: String,
    selected: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    locked: Boolean = false,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val bg by animateColorAsState(if (selected) c.ink else c.surface, Motion.fast(), label = "sel-bg")
    val fg by animateColorAsState(
        when {
            !enabled -> if (selected) c.onInk.copy(alpha = 0.6f) else c.textDisabled
            selected -> c.onInk
            else -> c.textPrimary
        },
        Motion.fast(), label = "sel-fg",
    )
    Row(
        modifier.heightIn(min = Spacing.touchTarget).clip(Radii.pill).background(bg)
            .border(1.dp, if (selected) Color.Transparent else c.border, Radii.pill)
            .clickable(enabled = enabled, role = Role.Checkbox) {
                haptics.perform(Haptic.Selection)
                onToggle()
            }
            .semantics { stateDescription = if (selected) "Selected" else "Not selected" }
            .padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
    ) {
        when {
            locked -> Icon(Icons.Rounded.Lock, null, tint = fg, modifier = Modifier.size(14.dp))
            selected -> Icon(Icons.Rounded.Check, null, tint = fg, modifier = Modifier.size(16.dp))
        }
        Text(label, style = BistroTheme.type.button.copy(fontSize = BistroTheme.type.supporting.fontSize), color = fg, maxLines = 1)
    }
}

/** A checkbox row with a title, a description and an optional note (why it's disabled). */
@Composable
fun CheckRow(
    title: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    note: String? = null,
    enabled: Boolean = true,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    Row(
        modifier.fillMaxWidth().heightIn(min = Spacing.touchTarget).clip(Radii.md)
            .clickable(enabled = enabled, role = Role.Checkbox) {
                haptics.perform(Haptic.Toggle)
                onToggle(!checked)
            }
            .padding(vertical = Spacing.sm, horizontal = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = BistroTheme.type.bodyStrong, color = if (enabled) c.textPrimary else c.textSecondary)
            if (subtitle != null) Text(subtitle, style = BistroTheme.type.supporting, color = c.textSecondary)
            if (note != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Icon(Icons.Rounded.Lock, null, tint = c.textTertiary, modifier = Modifier.size(12.dp))
                    Text(note, style = BistroTheme.type.metadata, color = c.textTertiary)
                }
            }
        }
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = CheckboxDefaults.colors(
                checkedColor = c.ink, checkmarkColor = c.onInk, uncheckedColor = c.borderStrong,
                disabledCheckedColor = c.textDisabled, disabledUncheckedColor = c.border,
            ),
            modifier = Modifier.padding(start = Spacing.sm),
        )
    }
}

/** Themed switch for inline list toggles (availability, active). */
@Composable
fun BistroSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    description: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    Switch(
        checked = checked,
        onCheckedChange = {
            haptics.perform(Haptic.Toggle)
            onCheckedChange(it)
        },
        enabled = enabled,
        modifier = modifier.semantics { contentDescription = description },
        colors = SwitchDefaults.colors(
            checkedTrackColor = c.success,
            checkedThumbColor = c.surface,
            uncheckedTrackColor = c.surfaceSunken,
            uncheckedBorderColor = c.borderStrong,
            uncheckedThumbColor = c.borderStrong,
            disabledCheckedTrackColor = c.success.copy(alpha = 0.4f),
            disabledUncheckedTrackColor = c.surfaceSunken,
        ),
    )
}

/** Search box with a clear button. */
@Composable
fun SearchField(value: String, onValueChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    Box(modifier) {
        BistroTextField(
            value = value, onValueChange = onValueChange, label = "Search", placeholder = placeholder,
            leadingIcon = Icons.Rounded.Search, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        if (value.isNotEmpty()) {
            ai.synkrasis.bistro.core.designsystem.component.BistroIconButton(
                Icons.Rounded.Close, "Clear search", { onValueChange("") },
                modifier = Modifier.align(Alignment.CenterEnd).padding(top = Spacing.xs),
                tint = BistroTheme.colors.textSecondary,
            )
        }
    }
}

/** A label + value line for detail sheets. */
@Composable
fun DetailLine(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = Spacing.xs), verticalAlignment = Alignment.Top) {
        Text(label, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary, modifier = Modifier.weight(0.4f))
        Text(
            value, style = BistroTheme.type.body, color = BistroTheme.colors.textPrimary,
            modifier = Modifier.weight(0.6f), maxLines = 4, overflow = TextOverflow.Ellipsis,
        )
    }
}
