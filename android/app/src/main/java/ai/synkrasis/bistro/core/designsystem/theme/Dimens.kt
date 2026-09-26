package ai.synkrasis.bistro.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** 4-dp spacing scale. */
object Spacing {
    val xxs: Dp = 2.dp
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 20.dp
    val xxl: Dp = 24.dp
    val xxxl: Dp = 32.dp
    val section: Dp = 28.dp
    /** Horizontal gutter for page content. */
    val gutter: Dp = 20.dp
    /** Minimum interactive size (Material/WCAG). */
    val touchTarget: Dp = 48.dp
}

@Immutable
object Radii {
    val xs = RoundedCornerShape(6.dp)
    val sm = RoundedCornerShape(10.dp)
    val md = RoundedCornerShape(14.dp)
    val lg = RoundedCornerShape(20.dp)
    val xl = RoundedCornerShape(28.dp)
    val pill = RoundedCornerShape(percent = 50)
    val sheet = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
}
