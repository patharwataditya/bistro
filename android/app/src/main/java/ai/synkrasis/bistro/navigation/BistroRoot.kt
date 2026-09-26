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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

/** Session gate: restoring → sign-in → the app. Crossfades between them. */
@Composable
fun BistroRoot(container: AppContainer) {
    val state by container.session.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
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
                        BistroButton("Sign in again", { scope.launch { container.session.signOut() } }, style = ButtonStyle.Ghost)
                    }
                }
                is SessionState.SignedOut -> LoginScreen(notice = s.notice)
                is SessionState.SignedIn -> MainShell(container, s)
            }
        }
    }
}
