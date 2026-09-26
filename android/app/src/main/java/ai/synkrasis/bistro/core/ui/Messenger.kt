package ai.synkrasis.bistro.core.ui

import ai.synkrasis.bistro.core.designsystem.component.UiMessage
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

/** App-wide toast host; the shell renders [current] above everything. */
@Stable
class Messenger {
    var current by mutableStateOf<UiMessage?>(null)
        private set

    fun show(message: UiMessage) {
        current = message
    }

    suspend fun autoDismiss() {
        val shown = current ?: return
        val base = if (shown.kind == ai.synkrasis.bistro.core.designsystem.component.MessageKind.Error) 6000L else 2800L
        delay(if (shown.text.length > 60) base + 1400 else base)
        if (current?.id == shown.id) current = null
    }
}

val LocalMessenger = staticCompositionLocalOf { Messenger() }

/** Collects a ViewModel's one-off effects: toast + haptic, navigation, back. */
@Composable
fun CollectEffects(effects: Flow<UiEffect>, onNavigate: (Any) -> Unit = {}, onBack: () -> Unit = {}) {
    val messenger = LocalMessenger.current
    val haptics = LocalHaptics.current
    LaunchedEffect(effects) {
        effects.collect { effect ->
            when (effect) {
                is UiEffect.Message -> {
                    effect.haptic?.let(haptics::perform)
                    messenger.show(effect.message)
                }
                is UiEffect.Navigate -> onNavigate(effect.route)
                UiEffect.Back -> onBack()
            }
        }
    }
}
