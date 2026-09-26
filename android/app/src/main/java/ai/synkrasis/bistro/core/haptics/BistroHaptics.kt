package ai.synkrasis.bistro.core.haptics

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalView

/**
 * Semantic haptic events. Screens say *what happened*; this decides how it feels, so the
 * vocabulary stays consistent and one place adapts to what the device supports.
 *
 * Most taps deliberately have no haptic. These are for moments that change state.
 */
enum class Haptic {
    /** Choosing among options: a table, a category, a segmented tab, a stepper tick. */
    Selection,
    /** A switch or toggle flipped. */
    Toggle,
    /** A deliberate commit is about to happen or has been accepted (confirm dialog, send). */
    Confirm,
    /** Something important completed: order sent, payment taken, saved. */
    Success,
    /** The action failed or was refused. */
    Reject,
    /** About to destroy or void something. */
    Destructive,
    /** Long-press picked something up / opened a context menu. */
    LongPress,
}

@Stable
fun interface HapticPerformer {
    fun perform(event: Haptic)
}

/** Maps events onto the platform's own feedback constants (which honour system settings). */
class ViewHapticPerformer(
    private val view: View,
    private val enabled: () -> Boolean,
) : HapticPerformer {
    override fun perform(event: Haptic) {
        if (!enabled()) return
        val constant = when (event) {
            Haptic.Selection -> HapticFeedbackConstants.CLOCK_TICK
            Haptic.Toggle -> if (Build.VERSION.SDK_INT >= 34) {
                HapticFeedbackConstants.TOGGLE_ON
            } else {
                HapticFeedbackConstants.CLOCK_TICK
            }
            Haptic.Confirm -> if (Build.VERSION.SDK_INT >= 30) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.VIRTUAL_KEY
            }
            Haptic.Success -> if (Build.VERSION.SDK_INT >= 30) {
                HapticFeedbackConstants.CONFIRM
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
            Haptic.Reject -> if (Build.VERSION.SDK_INT >= 30) {
                HapticFeedbackConstants.REJECT
            } else {
                HapticFeedbackConstants.LONG_PRESS
            }
            Haptic.Destructive -> HapticFeedbackConstants.LONG_PRESS
            Haptic.LongPress -> HapticFeedbackConstants.LONG_PRESS
        }
        // Devices without a vibrator, or with haptics disabled, simply ignore the request.
        runCatching { view.performHapticFeedback(constant) }
    }
}

val LocalHaptics = staticCompositionLocalOf<HapticPerformer> { HapticPerformer { } }

@Composable
fun rememberViewHaptics(enabled: () -> Boolean): HapticPerformer {
    val view = LocalView.current
    return remember(view) { ViewHapticPerformer(view, enabled) }
}
