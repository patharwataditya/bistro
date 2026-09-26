package ai.synkrasis.bistro.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay

/**
 * Refreshes while the screen is visible (STARTED) and stops when it's not. Live restaurant
 * state (floor, kitchen, dashboard) is polled rather than pushed: simple, robust on flaky
 * Wi-Fi, and cheap at these intervals.
 */
@Composable
fun PollWhileVisible(intervalMillis: Long, onTick: suspend () -> Unit) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val tick = rememberUpdatedState(onTick)
    LaunchedEffect(lifecycle, intervalMillis) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                tick.value()
                delay(intervalMillis)
            }
        }
    }
}
