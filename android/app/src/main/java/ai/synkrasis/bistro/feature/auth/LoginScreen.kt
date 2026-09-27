package ai.synkrasis.bistro.feature.auth

import ai.synkrasis.bistro.AppContainer
import ai.synkrasis.bistro.BuildConfig
import ai.synkrasis.bistro.R
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.component.colors
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Manrope
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.network.AppError
import ai.synkrasis.bistro.core.network.toAppError
import ai.synkrasis.bistro.core.ui.bistroViewModel
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
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
                // This ViewModel outlives the session (it sits above navigation): never leave
                // one person's credentials on the form for the next person at a shared device.
                username = ""
                password = ""
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

/**
 * Sign-in: a branded hero (ember glow over a faint floor plan — the product in one image)
 * with the form on a card that overlaps it. Content enters in a short stagger; the glow
 * drifts slowly and never competes with the form.
 */
@Composable
fun LoginScreen(notice: String?) {
    val vm = bistroViewModel { LoginViewModel(it) }
    val c = BistroTheme.colors
    BoxWithConstraints(Modifier.fillMaxSize().background(c.background)) {
        val wide = maxWidth >= 720.dp
        val heroHeight = if (wide) maxHeight else (maxHeight * 0.42f).coerceIn(300.dp, 400.dp)
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                Hero(Modifier.weight(1f).fillMaxSize(), large = true)
                Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.Center) {
                    FormColumn(vm, notice, Modifier.widthIn(max = 440.dp).padding(Spacing.xxl))
                }
            }
        } else {
            Hero(Modifier.fillMaxWidth().height(heroHeight + 120.dp), large = false, fadeInto = c.background)
            Column(
                Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // The card rises over the lower edge of the hero.
                Gap(heroHeight - 36.dp)
                FormColumn(vm, notice, Modifier.widthIn(max = 480.dp).padding(horizontal = Spacing.lg))
            }
        }
    }
}

@Composable
private fun Hero(modifier: Modifier, large: Boolean, fadeInto: Color? = null) {
    val c = BistroTheme.colors
    // The hero is always deep and warm, whatever the appearance: the brand's one bold surface.
    val top = if (c.isDark) Color(0xFF1B140F) else Color(0xFF1C1712)
    val bottom = if (c.isDark) c.background else Color(0xFF2A1D14)
    val glow = rememberInfiniteTransition(label = "glow")
    val drift by glow.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(9_000, easing = LinearEasing), RepeatMode.Reverse),
        label = "drift",
    )
    val enter = remember { Animatable(0f) }
    LaunchedEffect(Unit) { enter.animateTo(1f, tween(Motion.EMPHASIZED + 180, easing = Motion.EmphasizedDecelerate)) }

    // On phones the hero dissolves into the page behind the card instead of ending in a hard edge.
    val stops = if (fadeInto != null) {
        arrayOf(0f to top, 0.62f to bottom, 1f to fadeInto)
    } else {
        arrayOf(0f to top, 1f to bottom)
    }
    Box(modifier.background(Brush.verticalGradient(colorStops = stops))) {
        Canvas(Modifier.fillMaxSize()) {
            drawFloorPlan()
            // Ember glow: two soft radial lights that drift a little, like a wood-fired oven.
            val w = size.width
            val h = size.height
            drawCircle(
                Brush.radialGradient(
                    listOf(Color(0xFFE0703C).copy(alpha = 0.55f), Color.Transparent),
                    center = Offset(w * (0.78f - 0.06f * drift), h * (0.18f + 0.05f * drift)),
                    radius = w * 0.75f,
                ),
                radius = w * 0.75f,
                center = Offset(w * (0.78f - 0.06f * drift), h * (0.18f + 0.05f * drift)),
            )
            drawCircle(
                Brush.radialGradient(
                    listOf(Color(0xFFF4B860).copy(alpha = 0.18f), Color.Transparent),
                    center = Offset(w * (0.12f + 0.05f * drift), h * 0.82f),
                    radius = w * 0.55f,
                ),
                radius = w * 0.55f,
                center = Offset(w * (0.12f + 0.05f * drift), h * 0.82f),
            )
        }
        Column(
            Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Spacing.xxl, vertical = Spacing.xl)
                .graphicsLayer {
                    alpha = enter.value
                    translationY = (1f - enter.value) * 24.dp.toPx()
                },
            verticalArrangement = if (large) Arrangement.Center else Arrangement.Top,
        ) {
            if (!large) Gap(Spacing.xl)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(if (large) 64.dp else 52.dp).clip(Radii.lg)
                        .background(Color.White.copy(alpha = 0.08f))
                        .border(1.dp, Color.White.copy(alpha = 0.14f), Radii.lg),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(painterResource(R.drawable.ic_splash_mark), null, Modifier.size(if (large) 58.dp else 48.dp))
                }
                Gap(Spacing.md)
                Text(
                    "Bistro",
                    style = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold,
                        fontSize = if (large) 40.sp else 30.sp, letterSpacing = (-0.03).em),
                    color = Color(0xFFFBF6EF),
                )
            }
            Gap(if (large) Spacing.xxl else Spacing.xl)
            Text(
                "Run the floor,\nthe kitchen and the till.",
                style = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold,
                    fontSize = if (large) 34.sp else 26.sp, lineHeight = if (large) 40.sp else 32.sp,
                    letterSpacing = (-0.02).em),
                color = Color(0xFFFBF6EF),
                modifier = Modifier.semantics { heading() },
            )
            Gap(Spacing.md)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                listOf("Tables", "Kitchen", "Billing").forEach { HeroPill(it) }
            }
        }
    }
}

@Composable
private fun HeroPill(text: String) {
    Text(
        text.uppercase(),
        style = BistroTheme.type.statusLabel,
        color = Color(0xFFF4D9C4),
        modifier = Modifier.clip(Radii.pill).background(Color.White.copy(alpha = 0.08f))
            .border(1.dp, Color.White.copy(alpha = 0.12f), Radii.pill)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

/** A faint restaurant floor plan: round and square tables with chairs, in hairlines. */
private fun DrawScope.drawFloorPlan() {
    val line = Color.White.copy(alpha = 0.055f)
    val stroke = Stroke(width = 1.2.dp.toPx())
    val cell = 92.dp.toPx()
    val cols = (size.width / cell).toInt() + 2
    val rows = (size.height / cell).toInt() + 2
    for (r in 0 until rows) {
        for (col in 0 until cols) {
            val cx = col * cell + if (r % 2 == 0) cell * 0.25f else cell * 0.75f
            val cy = r * cell + cell * 0.5f
            if ((r + col) % 2 == 0) {
                val t = 18.dp.toPx()
                drawCircle(line, radius = t, center = Offset(cx, cy), style = stroke)
                val chair = 5.dp.toPx()
                listOf(0f, 90f, 180f, 270f).forEach { deg ->
                    val rad = Math.toRadians(deg.toDouble())
                    drawCircle(line, radius = chair, style = stroke,
                        center = Offset(cx + ((t + 9.dp.toPx()) * kotlin.math.cos(rad)).toFloat(),
                            cy + ((t + 9.dp.toPx()) * kotlin.math.sin(rad)).toFloat()))
                }
            } else {
                val s = 30.dp.toPx()
                drawRoundRect(line, topLeft = Offset(cx - s / 2, cy - s / 2), size = Size(s, s),
                    cornerRadius = CornerRadius(5.dp.toPx()), style = stroke)
            }
        }
    }
}

@Composable
private fun FormColumn(vm: LoginViewModel, notice: String?, modifier: Modifier) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val passwordFocus = remember { FocusRequester() }
    val rise = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(90)
        rise.animateTo(1f, tween(Motion.EMPHASIZED + 120, easing = Motion.EmphasizedDecelerate))
    }
    val submit = { vm.submit { haptics.perform(Haptic.Reject) } }

    Column(
        modifier.fillMaxWidth().navigationBarsPadding()
            .graphicsLayer {
                alpha = rise.value
                translationY = (1f - rise.value) * 40.dp.toPx()
            },
    ) {
        Column(
            Modifier.fillMaxWidth()
                .shadow(if (c.isDark) 0.dp else 24.dp, Radii.xl, ambientColor = c.shadow, spotColor = c.shadow)
                .clip(Radii.xl).background(c.surface).border(1.dp, c.border, Radii.xl)
                .padding(Spacing.xxl),
        ) {
            Text("Sign in", style = BistroTheme.type.pageTitle, color = c.textPrimary, modifier = Modifier.semantics { heading() })
            Gap(Spacing.xs)
            Text("Use your staff account to continue.", style = BistroTheme.type.supporting, color = c.textSecondary)
            Gap(Spacing.xl)

            val banner = vm.error?.message ?: notice
            AnimatedVisibility(banner != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                val isError = vm.error != null
                val tone = (if (isError) Tone.Danger else Tone.Info).colors()
                Row(
                    Modifier.fillMaxWidth().padding(bottom = Spacing.lg).clip(Radii.md).background(tone.container)
                        .padding(Spacing.md).semantics { liveRegion = LiveRegionMode.Assertive },
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(if (isError) Icons.Rounded.ErrorOutline else Icons.Rounded.Info, null, tint = tone.content, modifier = Modifier.size(18.dp))
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
                keyboardActions = KeyboardActions(onGo = { submit() }),
            )
            Gap(Spacing.xl)
            BistroButton(
                text = "Sign in",
                onClick = submit,
                modifier = Modifier.fillMaxWidth(),
                size = ButtonSize.Large,
                style = ButtonStyle.Accent,
                enabled = vm.canSubmit || vm.submitting,
                loading = vm.submitting,
            )
            Gap(Spacing.lg)
            Text(
                "Forgot your password? Ask a manager.",
                style = BistroTheme.type.metadata, color = c.textTertiary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Gap(Spacing.lg)
        Row(
            Modifier.align(Alignment.CenterHorizontally).padding(bottom = Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Rounded.VerifiedUser, null, tint = c.textTertiary, modifier = Modifier.size(14.dp))
            Text("Encrypted connection · Bistro ${BuildConfig.VERSION_NAME}", style = BistroTheme.type.metadata, color = c.textTertiary)
        }
    }
}

