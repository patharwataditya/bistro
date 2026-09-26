package ai.synkrasis.bistro.core.designsystem.theme

import androidx.compose.foundation.LocalIndication
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

private val LocalBistroColors = staticCompositionLocalOf { LightColors }
private val LocalBistroTypography = staticCompositionLocalOf { BistroTypography() }
private val LocalAppearance = staticCompositionLocalOf { Appearance.Default }

object BistroTheme {
    val colors: BistroColors
        @Composable @ReadOnlyComposable get() = LocalBistroColors.current
    val type: BistroTypography
        @Composable @ReadOnlyComposable get() = LocalBistroTypography.current
    val appearance: Appearance
        @Composable @ReadOnlyComposable get() = LocalAppearance.current
}

@Composable
fun BistroTheme(appearance: Appearance, content: @Composable () -> Unit) {
    val colors = colorsFor(appearance)
    val type = BistroTypography()
    CompositionLocalProvider(
        LocalBistroColors provides colors,
        LocalBistroTypography provides type,
        LocalAppearance provides appearance,
    ) {
        MaterialTheme(
            colorScheme = materialScheme(colors),
            typography = materialTypography(type),
            shapes = Shapes(
                extraSmall = Radii.xs, small = Radii.sm, medium = Radii.md,
                large = Radii.lg, extraLarge = Radii.xl,
            ),
        ) {
            CompositionLocalProvider(LocalIndication provides ripple(color = colors.textPrimary)) {
                content()
            }
        }
    }
}

/** Material components (text fields, dialogs, switches) pick up the same semantic palette. */
private fun materialScheme(c: BistroColors): ColorScheme {
    val base = if (c.isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = c.ink, onPrimary = c.onInk,
        primaryContainer = c.accentSoft, onPrimaryContainer = c.textPrimary,
        secondary = c.accent, onSecondary = c.onAccent,
        secondaryContainer = c.accentSoft, onSecondaryContainer = c.textPrimary,
        tertiary = c.info, onTertiary = c.onInk,
        background = c.background, onBackground = c.textPrimary,
        surface = c.surface, onSurface = c.textPrimary,
        surfaceVariant = c.surfaceSunken, onSurfaceVariant = c.textSecondary,
        surfaceContainerLowest = c.surface, surfaceContainerLow = c.surface,
        surfaceContainer = c.surfaceRaised, surfaceContainerHigh = c.surfaceRaised,
        surfaceContainerHighest = c.surfaceSunken, surfaceBright = c.surfaceRaised,
        surfaceDim = c.background,
        outline = c.borderStrong, outlineVariant = c.border,
        error = c.danger, onError = c.onInk, errorContainer = c.dangerSoft,
        onErrorContainer = c.danger, scrim = c.scrim,
        inverseSurface = c.ink, inverseOnSurface = c.onInk, inversePrimary = c.accent,
    )
}

private fun materialTypography(t: BistroTypography) = Typography(
    displayLarge = t.amountHero, displayMedium = t.display, displaySmall = t.pageTitle,
    headlineLarge = t.pageTitle, headlineMedium = t.pageTitle, headlineSmall = t.sectionTitle,
    titleLarge = t.sectionTitle, titleMedium = t.cardTitle, titleSmall = t.bodyStrong,
    bodyLarge = t.body, bodyMedium = t.body, bodySmall = t.supporting,
    labelLarge = t.button, labelMedium = t.metadata, labelSmall = t.statusLabel,
)
