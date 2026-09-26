package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * Card surface: hairline border everywhere, plus a soft shadow only in Light (shadows are
 * invisible on dark surfaces and muddy on OLED black, so depth there comes from tone).
 */
@Composable
fun BistroCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    onClickLabel: String? = null,
    shape: Shape = Radii.lg,
    container: Color = BistroTheme.colors.surface,
    borderColor: Color = BistroTheme.colors.border,
    elevated: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(Spacing.lg),
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = BistroTheme.colors
    val interaction = remember { MutableInteractionSource() }
    var m = modifier
    if (onClick != null) m = m.pressScale(interaction, 0.98f)
    if (elevated && !c.isDark) m = m.shadow(6.dp, shape, ambientColor = c.shadow, spotColor = c.shadow)
    m = m.clip(shape).background(container).border(1.dp, borderColor, shape)
    if (onClick != null) {
        m = m.combinedClickable(
            interactionSource = interaction,
            indication = androidx.compose.material3.ripple(),
            role = Role.Button,
            onClickLabel = onClickLabel,
            onLongClick = onLongClick,
            onClick = onClick,
        )
    }
    Column(m.padding(contentPadding), content = content)
}

@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = BistroTheme.type.sectionTitle, color = BistroTheme.colors.textPrimary,
                modifier = Modifier.semantics { heading() })
            if (subtitle != null) {
                Text(subtitle, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
            }
        }
        action?.invoke()
    }
}

/** Status label: icon + text + tone. Never colour alone. */
@Composable
fun StatusChip(
    label: String,
    tone: Tone,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    emphasized: Boolean = false,
) {
    val colors = tone.colors()
    val bg = if (emphasized) colors.content else colors.container
    val fg = if (emphasized) BistroTheme.colors.surface else colors.content
    Row(
        modifier
            .clip(Radii.pill)
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .clearAndSetSemantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (icon != null) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(13.dp))
        } else {
            Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        }
        Text(label.uppercase(), style = BistroTheme.type.statusLabel, color = fg, maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}

/** Small round count badge. */
@Composable
fun CountBadge(count: Int, tone: Tone, modifier: Modifier = Modifier) {
    val colors = tone.colors()
    Box(
        modifier
            .clip(Radii.pill)
            .background(colors.content)
            .padding(horizontal = 7.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("$count", style = BistroTheme.type.statusLabel, color = BistroTheme.colors.surface)
    }
}

@Composable
fun HairlineDivider(modifier: Modifier = Modifier) {
    Box(modifier.padding(vertical = Spacing.xs).fillMaxWidth().height(1.dp)
        .background(BistroTheme.colors.border))
}
