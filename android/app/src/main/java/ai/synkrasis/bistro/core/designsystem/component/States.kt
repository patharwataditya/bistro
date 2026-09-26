package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.network.AppError
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Friendly, specific empty state with an optional next step. */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = Spacing.xxxl, vertical = Spacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(72.dp).clip(Radii.xl).background(BistroTheme.colors.surfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = BistroTheme.colors.textTertiary, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(Spacing.lg))
        Text(title, style = BistroTheme.type.cardTitle, color = BistroTheme.colors.textPrimary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Spacing.xs))
        Text(
            message, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary,
            textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp),
        )
        if (action != null) {
            Spacer(Modifier.height(Spacing.xl))
            action()
        }
    }
}

/** Full-area error with a specific explanation and, when it helps, a retry. */
@Composable
fun ErrorState(error: AppError, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    val (icon, title) = when (error) {
        AppError.Offline -> Icons.Rounded.WifiOff to "No connection"
        AppError.Timeout -> Icons.Rounded.CloudOff to "Server not responding"
        is AppError.PermissionDenied -> Icons.Rounded.Lock to "Not available to you"
        is AppError.NotFound -> Icons.Rounded.SearchOff to "Not found"
        else -> Icons.Rounded.ErrorOutline to "Couldn't load this"
    }
    EmptyState(
        icon = icon, title = title, message = error.message,
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        action = if (onRetry != null && error.retryable) {
            { BistroButton("Try again", onRetry, style = ButtonStyle.Secondary) }
        } else {
            null
        },
    )
}

/** Thin banner shown above data that is still displayed but could not be refreshed. */
@Composable
fun StaleBanner(error: AppError?, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = error != null,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut(),
        modifier = modifier,
    ) {
        val tone = Tone.Warning.colors()
        Row(
            Modifier.fillMaxWidth().clip(Radii.md).background(tone.container)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm)
                .semantics { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Icon(Icons.Rounded.WifiOff, null, tint = tone.content, modifier = Modifier.size(16.dp))
            Text(
                when (error) {
                    AppError.Offline -> "Offline — showing the last update. Reconnecting…"
                    else -> "Couldn't refresh — showing the last update. Retrying…"
                },
                style = BistroTheme.type.metadata, color = tone.content,
            )
        }
    }
}

/** Shimmering placeholder block for skeleton layouts. */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 16.dp) {
    val c = BistroTheme.colors
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -1f, targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmer-x",
    )
    val base = c.surfaceSunken
    val highlight = if (c.isDark) c.surfaceRaised else c.surface
    Box(
        modifier.height(height).clip(Radii.sm).background(
            Brush.linearGradient(
                colors = listOf(base, highlight, base),
                start = androidx.compose.ui.geometry.Offset(x * 600f, 0f),
                end = androidx.compose.ui.geometry.Offset(x * 600f + 400f, 200f),
            ),
        ),
    )
}

/** A grid/list of skeleton cards shaped like the content that is loading. */
@Composable
fun SkeletonList(modifier: Modifier = Modifier, rows: Int = 5, rowHeight: Dp = 72.dp) {
    Column(modifier.fillMaxSize().padding(Spacing.gutter), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        repeat(rows) { Skeleton(Modifier.fillMaxWidth(), rowHeight) }
    }
}
