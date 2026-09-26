package ai.synkrasis.bistro.core.designsystem.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * Semantic colour tokens. Composables read these (via [BistroTheme.colors]) and never
 * hard-code hex values, so every screen follows the active appearance automatically.
 */
@Immutable
data class BistroColors(
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textDisabled: Color,
    /** High-contrast neutral used for primary buttons ("ink" on light, "chalk" on dark). */
    val ink: Color,
    val onInk: Color,
    /** Brand accent: the ember of a wood-fired oven. Reserved for key actions and highlights. */
    val accent: Color,
    val accentSoft: Color,
    val onAccent: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val info: Color,
    val infoSoft: Color,
    val neutral: Color,
    val neutralSoft: Color,
    val cleaning: Color,
    val cleaningSoft: Color,
    val scrim: Color,
    val shadow: Color,
    val isDark: Boolean,
)

internal val LightColors = BistroColors(
    background = Color(0xFFF6F3EE),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceSunken = Color(0xFFEFEAE3),
    border = Color(0xFFE7E1D8),
    borderStrong = Color(0xFFD4CCC0),
    textPrimary = Color(0xFF1A1814),
    textSecondary = Color(0xFF5C574F),
    textTertiary = Color(0xFF8A847A),
    textDisabled = Color(0xFFB8B2A8),
    ink = Color(0xFF1C1A16),
    onInk = Color(0xFFFBF9F6),
    accent = Color(0xFFD9602E),
    accentSoft = Color(0xFFFBE7DD),
    onAccent = Color(0xFFFFFFFF),
    success = Color(0xFF1E8A57),
    successSoft = Color(0xFFDFF3E8),
    warning = Color(0xFFB7791F),
    warningSoft = Color(0xFFFBEFD6),
    danger = Color(0xFFC8372D),
    dangerSoft = Color(0xFFFBE2DF),
    info = Color(0xFF4655C8),
    infoSoft = Color(0xFFE5E8FB),
    neutral = Color(0xFF6B6760),
    neutralSoft = Color(0xFFEDEAE5),
    cleaning = Color(0xFF0E8C96),
    cleaningSoft = Color(0xFFDDF2F3),
    scrim = Color(0x66120F0A),
    shadow = Color(0x1F2B2115),
    isDark = false,
)

internal val DarkColors = BistroColors(
    background = Color(0xFF141311),
    surface = Color(0xFF1D1C19),
    surfaceRaised = Color(0xFF262421),
    surfaceSunken = Color(0xFF100F0D),
    border = Color(0xFF302D29),
    borderStrong = Color(0xFF45413B),
    textPrimary = Color(0xFFF3F0EA),
    textSecondary = Color(0xFFB7B1A7),
    textTertiary = Color(0xFF8A847A),
    textDisabled = Color(0xFF5A564F),
    ink = Color(0xFFF3F0EA),
    onInk = Color(0xFF171512),
    accent = Color(0xFFF07A45),
    accentSoft = Color(0xFF3A2419),
    onAccent = Color(0xFF1A0E08),
    success = Color(0xFF46C98A),
    successSoft = Color(0xFF16301F),
    warning = Color(0xFFF0B44C),
    warningSoft = Color(0xFF342812),
    danger = Color(0xFFF26B5E),
    dangerSoft = Color(0xFF3A1B18),
    info = Color(0xFF8C98FF),
    infoSoft = Color(0xFF1F2340),
    neutral = Color(0xFFA29C92),
    neutralSoft = Color(0xFF2A2825),
    cleaning = Color(0xFF45C7D0),
    cleaningSoft = Color(0xFF12292B),
    scrim = Color(0x99000000),
    shadow = Color(0x66000000),
    isDark = true,
)

/** True black for OLED panels: surfaces separate by hairline borders rather than tone. */
internal val BlackColors = DarkColors.copy(
    background = Color(0xFF000000),
    surface = Color(0xFF0A0A0A),
    surfaceRaised = Color(0xFF131313),
    surfaceSunken = Color(0xFF000000),
    border = Color(0xFF242424),
    borderStrong = Color(0xFF383838),
    textPrimary = Color(0xFFF5F3EF),
    textSecondary = Color(0xFFB3AEA6),
    accentSoft = Color(0xFF2B170D),
    successSoft = Color(0xFF0C2215),
    warningSoft = Color(0xFF261B08),
    dangerSoft = Color(0xFF2A100D),
    infoSoft = Color(0xFF141733),
    neutralSoft = Color(0xFF1A1A1A),
    cleaningSoft = Color(0xFF081C1E),
    shadow = Color(0x00000000),
)

fun colorsFor(appearance: Appearance): BistroColors = when (appearance) {
    Appearance.Light -> LightColors
    Appearance.Dark -> DarkColors
    Appearance.Black -> BlackColors
}
