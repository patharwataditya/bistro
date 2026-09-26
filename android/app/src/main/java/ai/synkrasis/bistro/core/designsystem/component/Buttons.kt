package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class ButtonStyle { Primary, Accent, Secondary, Danger, Ghost }
enum class ButtonSize(val height: Dp, val horizontal: Dp) { Small(40.dp, 14.dp), Medium(48.dp, 18.dp), Large(56.dp, 22.dp) }

/**
 * The one button. While [loading] it keeps its size, shows a spinner and ignores taps, which
 * is what stops a double-tap from sending an order twice.
 */
@Composable
fun BistroButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: ButtonStyle = ButtonStyle.Primary,
    size: ButtonSize = ButtonSize.Medium,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    trailing: String? = null,
) {
    val c = BistroTheme.colors
    val (bg, fg, border) = when (style) {
        ButtonStyle.Primary -> Triple(c.ink, c.onInk, Color.Transparent)
        ButtonStyle.Accent -> Triple(c.accent, c.onAccent, Color.Transparent)
        ButtonStyle.Secondary -> Triple(c.surface, c.textPrimary, c.borderStrong)
        ButtonStyle.Danger -> Triple(c.dangerSoft, c.danger, Color.Transparent)
        ButtonStyle.Ghost -> Triple(Color.Transparent, c.textPrimary, Color.Transparent)
    }
    val active = enabled && !loading
    val background by animateColorAsState(
        if (enabled) bg else if (style == ButtonStyle.Ghost) Color.Transparent else c.surfaceSunken,
        Motion.fast(), label = "btn-bg",
    )
    val content by animateColorAsState(if (enabled) fg else c.textDisabled, Motion.fast(), label = "btn-fg")
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = size.height)
            .pressScale(interaction)
            .clip(Radii.md)
            .background(background)
            .border(1.dp, if (enabled) border else Color.Transparent, Radii.md)
            .clickable(
                interactionSource = interaction,
                indication = androidx.compose.material3.ripple(color = content),
                enabled = active,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { if (loading) stateDescription = "Working" }
            .padding(PaddingValues(horizontal = size.horizontal)),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = loading,
            transitionSpec = { fadeIn(Motion.fast()) togetherWith fadeOut(Motion.fast()) },
            label = "btn-content",
        ) { isLoading ->
            if (isLoading) {
                CircularProgressIndicator(Modifier.size(20.dp), color = content, strokeWidth = 2.dp)
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    if (icon != null) Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(20.dp))
                    Text(text, style = BistroTheme.type.button, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (trailing != null) {
                        Text(trailing, style = BistroTheme.type.button, color = content.copy(alpha = 0.72f), maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
fun BistroIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = BistroTheme.colors.textPrimary,
    container: Color = Color.Transparent,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .size(Spacing.touchTarget)
            .pressScale(interaction, 0.9f)
            .clip(Radii.pill)
            .background(container)
            .clickable(
                interactionSource = interaction,
                indication = androidx.compose.material3.ripple(bounded = false, radius = 24.dp),
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = if (enabled) tint else BistroTheme.colors.textDisabled, modifier = Modifier.size(22.dp))
    }
}
