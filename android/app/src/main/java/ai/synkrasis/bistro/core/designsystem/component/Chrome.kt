package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** Page header: large title, optional eyebrow/subtitle, back button and actions. */
@Composable
fun BistroTopBar(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val c = BistroTheme.colors
    Column(
        modifier.fillMaxWidth().background(c.background).windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = if (onBack != null) Spacing.xs else Spacing.gutter, end = Spacing.sm, top = Spacing.sm, bottom = Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                BistroIconButton(Icons.AutoMirrored.Rounded.ArrowBack, "Back", onBack)
            }
            Column(Modifier.weight(1f).padding(start = if (onBack != null) Spacing.xs else 0.dp)) {
                if (eyebrow != null) {
                    Text(eyebrow.uppercase(), style = BistroTheme.type.statusLabel, color = c.textTertiary, maxLines = 1)
                }
                Text(
                    title, style = BistroTheme.type.pageTitle, color = c.textPrimary, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() },
                )
                if (subtitle != null) {
                    Text(subtitle, style = BistroTheme.type.supporting, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, content = actions)
        }
    }
}

enum class MessageKind { Success, Error, Info }

@Immutable
data class UiMessage(val text: String, val kind: MessageKind = MessageKind.Info, val id: Long = System.nanoTime())

/** Floating toast used for action feedback (announced to screen readers). */
@Composable
fun MessageToast(message: UiMessage?, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = message != null,
        enter = slideInVertically(Motion.enter()) { it } + fadeIn(Motion.enter()),
        exit = slideOutVertically(Motion.exit()) { it } + fadeOut(Motion.exit()),
        modifier = modifier,
    ) {
        val c = BistroTheme.colors
        val m = message ?: return@AnimatedVisibility
        val (icon, tint) = when (m.kind) {
            MessageKind.Success -> Icons.Rounded.CheckCircle to c.success
            MessageKind.Error -> Icons.Rounded.ErrorOutline to c.danger
            MessageKind.Info -> Icons.Rounded.Info to c.info
        }
        Row(
            Modifier.padding(horizontal = Spacing.gutter, vertical = Spacing.md)
                .shadow(if (c.isDark) 0.dp else 12.dp, Radii.lg, ambientColor = c.shadow, spotColor = c.shadow)
                .clip(Radii.lg).background(c.ink).border(1.dp, c.borderStrong.copy(alpha = if (c.isDark) 1f else 0f), Radii.lg)
                .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                .semantics { liveRegion = if (m.kind == MessageKind.Error) LiveRegionMode.Assertive else LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
            Text(m.text, style = BistroTheme.type.bodyStrong, color = c.onInk)
        }
    }
}
