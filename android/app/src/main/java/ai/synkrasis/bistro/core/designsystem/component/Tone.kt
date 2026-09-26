package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

/** Semantic colour roles for status, never raw colours. */
enum class Tone { Accent, Success, Warning, Danger, Info, Neutral, Cleaning }

@Immutable
data class ToneColors(val content: Color, val container: Color)

@Composable
@ReadOnlyComposable
fun Tone.colors(): ToneColors {
    val c = BistroTheme.colors
    return when (this) {
        Tone.Accent -> ToneColors(c.accent, c.accentSoft)
        Tone.Success -> ToneColors(c.success, c.successSoft)
        Tone.Warning -> ToneColors(c.warning, c.warningSoft)
        Tone.Danger -> ToneColors(c.danger, c.dangerSoft)
        Tone.Info -> ToneColors(c.info, c.infoSoft)
        Tone.Neutral -> ToneColors(c.neutral, c.neutralSoft)
        Tone.Cleaning -> ToneColors(c.cleaning, c.cleaningSoft)
    }
}
