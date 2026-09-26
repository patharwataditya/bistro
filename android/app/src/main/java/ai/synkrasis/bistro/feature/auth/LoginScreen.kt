package ai.synkrasis.bistro.feature.auth

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.toAppError
import ai.synkrasis.bistro.core.ui.bistroViewModel
import ai.synkrasis.bistro.R
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class LoginViewModel(private val container: AppContainer) : ViewModel() {
    var username by mutableStateOf("")
    var password by mutableStateOf("")
    var submitting by mutableStateOf(false)
        private set
    var error by mutableStateOf<AppError?>(null)
        private set

    val canSubmit get() = username.isNotBlank() && password.isNotEmpty() && !submitting

    fun submit(onFailure: () -> Unit) {
        if (!canSubmit) return
        submitting = true
        error = null
        viewModelScope.launch {
            try {
                container.session.signIn(username, password, "${Build.MANUFACTURER} ${Build.MODEL}".take(120))
            } catch (t: Throwable) {
                error = t.toAppError(container.json).let {
                    // A 401 here is "wrong credentials", not "your session ended".
                    if (it is AppError.SessionEnded) AppError.Validation("Incorrect username or password.", emptyMap()) else it
                }
                password = ""
                onFailure()
            } finally {
                submitting = false
            }
        }
    }
}

@Composable
fun LoginScreen(notice: String?) {
    val vm = bistroViewModel { LoginViewModel(it) }
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val passwordFocus = FocusRequester()
    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(c.accentSoft.copy(alpha = if (c.isDark) 0.35f else 0.7f), c.background, c.background)),
        ),
    ) {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(Modifier.widthIn(max = 420.dp).fillMaxWidth()) {
                Gap(Spacing.xxxl)
                Box(Modifier.size(64.dp).clip(Radii.lg).background(c.ink), contentAlignment = Alignment.Center) {
                    Image(painterResource(R.drawable.ic_splash_mark), null, Modifier.size(56.dp))
                }
                Gap(Spacing.xxl)
                Text("Welcome to Bistro", style = BistroTheme.type.display, color = c.textPrimary)
                Gap(Spacing.xs)
                Text("Sign in to run the floor, the kitchen and the till.", style = BistroTheme.type.body, color = c.textSecondary)
                Gap(Spacing.xxl)

                val banner = vm.error?.message ?: notice
                AnimatedVisibility(banner != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    val tone = (if (vm.error != null) Tone.Danger else Tone.Info).colors()
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = Spacing.lg).clip(Radii.md).background(tone.container)
                            .padding(Spacing.md).semantics { liveRegion = LiveRegionMode.Assertive },
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, null, tint = tone.content, modifier = Modifier.size(18.dp))
                        Text(banner.orEmpty(), style = BistroTheme.type.supporting, color = tone.content)
                    }
                }

                BistroTextField(
                    value = vm.username,
                    onValueChange = { vm.username = it.take(40) },
                    label = "Username",
                    leadingIcon = Icons.Rounded.Person,
                    modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.Username },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next, autoCorrectEnabled = false),
                    keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
                )
                Gap(Spacing.md)
                BistroTextField(
                    value = vm.password,
                    onValueChange = { vm.password = it.take(128) },
                    label = "Password",
                    leadingIcon = Icons.Rounded.Lock,
                    password = true,
                    modifier = Modifier.fillMaxWidth().focusRequester(passwordFocus).semantics { contentType = ContentType.Password },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { vm.submit { haptics.perform(Haptic.Reject) } }),
                )
                Gap(Spacing.xxl)
                BistroButton(
                    text = "Sign in",
                    onClick = { vm.submit { haptics.perform(Haptic.Reject) } },
                    modifier = Modifier.fillMaxWidth(),
                    size = ButtonSize.Large,
                    enabled = vm.canSubmit || vm.submitting,
                    loading = vm.submitting,
                )
                Gap(Spacing.xxxl)
            }
        }
    }
}
