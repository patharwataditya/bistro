package ai.synkrasis.bistro.navigation

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.session.SessionState
import ai.synkrasis.bistro.feature.auth.LoginScreen
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Session gate: restoring → sign-in → the app. Crossfades between them. */
@Composable
fun BistroRoot(container: AppContainer) {
    val state by container.session.state.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(BistroTheme.colors.background)) {
        AnimatedContent(
            targetState = state,
            contentKey = { it::class },
            transitionSpec = { fadeIn(Motion.enter()) togetherWith fadeOut(Motion.exit()) },
            label = "root",
        ) { s ->
            when (s) {
                SessionState.Restoring -> Box(Modifier.fillMaxSize())
                is SessionState.RestoreFailed -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        ErrorState(s.error, onRetry = { container.session.restore() })
                        BistroButton("Sign in again", { container.session.signOut() }, style = ButtonStyle.Ghost)
                    }
                }
                is SessionState.SignedOut -> LoginScreen(notice = s.notice)
                is SessionState.SignedIn -> SessionScope(s.me.id) { MainShell(container, s) }
            }
        }
    }
}


/**
 * Every ViewModel (and navigation back-stack entry) created while signed in lives in this
 * store, which is cleared when the session ends or another user signs in. Nothing a previous
 * user loaded — bills, staff, reports — survives in memory for the next one.
 */
@Composable
private fun SessionScope(userId: Int, content: @Composable () -> Unit) {
    val owner = remember(userId) {
        object : ViewModelStoreOwner {
            override val viewModelStore = ViewModelStore()
        }
    }
    DisposableEffect(owner) { onDispose { owner.viewModelStore.clear() } }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner) { content() }
}
