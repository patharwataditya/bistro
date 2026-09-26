package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.Motion
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

/** Subtle press-down scale shared by every tappable surface. */
@Composable
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.97f): Modifier {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (isPressed) pressed else 1f, Motion.press(), label = "press")
    return this.graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
