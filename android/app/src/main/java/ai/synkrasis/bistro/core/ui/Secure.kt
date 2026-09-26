package ai.synkrasis.bistro.core.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext

/**
 * Keeps this screen out of screenshots, screen recordings and the recent-apps thumbnail
 * while it is shown (bills and payments, staff accounts, sales reports).
 */
@Composable
fun SecureScreen() {
    val activity = LocalContext.current.findActivity() ?: return
    DisposableEffect(activity) {
        // Counted: during a secure → secure transition the outgoing screen must not clear
        // the flag the incoming one needs.
        if (secureCount++ == 0) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            if (--secureCount == 0) activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}

private var secureCount = 0

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
