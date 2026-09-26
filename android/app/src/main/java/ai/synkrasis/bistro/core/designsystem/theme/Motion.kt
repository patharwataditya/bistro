package ai.synkrasis.bistro.core.designsystem.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.IntOffset

/**
 * Shared motion vocabulary. Short, decelerating movements that explain change without making
 * anyone wait: nothing here blocks input, and nothing bounces more than a hair.
 */
object Motion {
    const val FAST = 140
    const val STANDARD = 240
    const val EMPHASIZED = 360

    val Emphasized = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EmphasizedDecelerate = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val EmphasizedAccelerate = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)
    val Standard = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    fun <T> standard(): FiniteAnimationSpec<T> = tween(STANDARD, easing = Standard)
    fun <T> fast(): FiniteAnimationSpec<T> = tween(FAST, easing = Standard)
    fun <T> enter(): FiniteAnimationSpec<T> = tween(EMPHASIZED, easing = EmphasizedDecelerate)
    fun <T> exit(): FiniteAnimationSpec<T> = tween(FAST + 40, easing = EmphasizedAccelerate)

    /** Press feedback and small layout shifts: critically damped, crisp. */
    fun <T> press() = spring<T>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
    val placement = spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessMediumLow,
        visibilityThreshold = IntOffset(1, 1))
}
