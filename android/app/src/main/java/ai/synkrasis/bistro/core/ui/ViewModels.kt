package ai.synkrasis.bistro.core.ui

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.BistroApp
import ai.synkrasis.bistro.core.designsystem.component.MessageKind
import ai.synkrasis.bistro.core.designsystem.component.UiMessage
import ai.synkrasis.bistro.core.haptics.Haptic
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

@Composable
fun appContainer(): AppContainer = (LocalContext.current.applicationContext as BistroApp).container

/** ViewModel factory over the manual container, keyed so each screen instance gets its own. */
@Composable
inline fun <reified VM : ViewModel> bistroViewModel(key: String? = null, crossinline create: (AppContainer) -> VM): VM {
    val container = appContainer()
    return viewModel(key = key, factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T = create(container) as T
    })
}

/** One-off effects from a ViewModel: a toast, a haptic, navigation. Delivered exactly once. */
sealed interface UiEffect {
    data class Message(val message: UiMessage, val haptic: Haptic? = null) : UiEffect
    data class Navigate(val route: Any) : UiEffect
    data object Back : UiEffect
}

class Effects {
    private val channel = Channel<UiEffect>(Channel.BUFFERED)
    val flow: Flow<UiEffect> = channel.receiveAsFlow()

    fun success(text: String) = channel.trySend(UiEffect.Message(UiMessage(text, MessageKind.Success), Haptic.Success))
    fun error(text: String) = channel.trySend(UiEffect.Message(UiMessage(text, MessageKind.Error), Haptic.Reject))
    fun info(text: String) = channel.trySend(UiEffect.Message(UiMessage(text, MessageKind.Info), null))
    fun navigate(route: Any) = channel.trySend(UiEffect.Navigate(route))
    fun back() = channel.trySend(UiEffect.Back)
}
