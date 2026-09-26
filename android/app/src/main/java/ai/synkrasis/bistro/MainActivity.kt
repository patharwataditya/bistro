package ai.synkrasis.bistro

import ai.synkrasis.bistro.core.designsystem.theme.Appearance
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.haptics.rememberViewHaptics
import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.navigation.BistroRoot
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val container = (application as BistroApp).container
        val splash = installSplashScreen()
        // Hold the splash until we know the appearance and whether a session exists, so the
        // first frame is already the right theme and the right screen.
        splash.setKeepOnScreenCondition {
            container.preferences.appearance.value == null ||
                container.session.state.value is SessionState.Restoring
        }
        super.onCreate(savedInstanceState)
        setContent {
            val appearance by container.preferences.appearance.collectAsStateWithLifecycle()
            val hapticsOn by container.preferences.hapticsEnabled.collectAsStateWithLifecycle()
            val mode = appearance ?: Appearance.Default
            LaunchedEffect(mode) {
                val bars = if (mode.isDark) {
                    SystemBarStyle.dark(Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            }
            BistroTheme(mode) {
                val haptics = rememberViewHaptics { hapticsOn }
                CompositionLocalProvider(LocalHaptics provides haptics) {
                    BistroRoot(container)
                }
            }
        }
    }
}
