package ai.synkrasis.bistro.core.designsystem.theme

import ai.synkrasis.bistro.R
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private fun variable(resId: Int, weight: FontWeight) = Font(
    resId = resId,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

/** Display face: geometric and warm, for titles, table names and amounts. */
val Manrope = FontFamily(
    variable(R.font.manrope_variable, FontWeight.Normal),
    variable(R.font.manrope_variable, FontWeight.Medium),
    variable(R.font.manrope_variable, FontWeight.SemiBold),
    variable(R.font.manrope_variable, FontWeight.Bold),
    variable(R.font.manrope_variable, FontWeight.ExtraBold),
)

/** Text face: built for small sizes on screens. */
val Inter = FontFamily(
    variable(R.font.inter_variable, FontWeight.Normal),
    variable(R.font.inter_variable, FontWeight.Medium),
    variable(R.font.inter_variable, FontWeight.SemiBold),
    variable(R.font.inter_variable, FontWeight.Bold),
)

/** Tabular figures so amounts and timers don't jitter as digits change. */
private const val TABULAR = "tnum, lnum"

/**
 * One typographic scale for the whole app. Screens pick a role, never a raw size.
 */
@Immutable
data class BistroTypography(
    val display: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold,
        fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.02).em),
    val pageTitle: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold,
        fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.015).em),
    val sectionTitle: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp, lineHeight = 24.sp, letterSpacing = (-0.01).em),
    val cardTitle: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp, lineHeight = 22.sp),
    val tableLabel: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold,
        fontSize = 22.sp, lineHeight = 26.sp, letterSpacing = (-0.02).em),
    val identifier: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = TABULAR),
    val body: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal,
        fontSize = 15.sp, lineHeight = 22.sp),
    val bodyStrong: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = 22.sp),
    val supporting: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal,
        fontSize = 13.sp, lineHeight = 18.sp),
    val metadata: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium,
        fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = TABULAR),
    val statusLabel: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.06.em),
    val button: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = 0.005.em),
    val amountHero: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold,
        fontSize = 40.sp, lineHeight = 46.sp, letterSpacing = (-0.025).em,
        fontFeatureSettings = TABULAR),
    val amountLarge: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold,
        fontSize = 22.sp, lineHeight = 28.sp, fontFeatureSettings = TABULAR),
    val amount: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = 22.sp, fontFeatureSettings = TABULAR),
    val amountSmall: TextStyle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium,
        fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = TABULAR),
    val metric: TextStyle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.ExtraBold,
        fontSize = 28.sp, lineHeight = 32.sp, letterSpacing = (-0.02).em,
        fontFeatureSettings = TABULAR),
)
