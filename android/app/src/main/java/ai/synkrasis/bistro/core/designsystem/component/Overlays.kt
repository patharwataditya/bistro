package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Styled modal bottom sheet: title, optional subtitle, scrollable body, pinned actions. */
@Composable
fun BistroSheet(
    title: String,
    onDismiss: () -> Unit,
    subtitle: String? = null,
    busy: Boolean = false,
    actions: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = BistroTheme.colors
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        // While a request runs the sheet stays put: dismissing mid-charge would hide the result.
        sheetState = rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { it != androidx.compose.material3.SheetValue.Hidden || !busy },
        ),
        properties = androidx.compose.material3.ModalBottomSheetProperties(shouldDismissOnBackPress = !busy),
        shape = Radii.sheet,
        containerColor = c.surface,
        scrimColor = c.scrim,
        contentWindowInsets = { WindowInsets(0) },
        dragHandle = {
            Box(Modifier.padding(top = Spacing.md, bottom = Spacing.xs).size(width = 40.dp, height = 4.dp)
                .clip(Radii.pill).background(c.borderStrong))
        },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding()) {
            Column(Modifier.padding(horizontal = Spacing.xxl, vertical = Spacing.sm)) {
                Text(title, style = BistroTheme.type.sectionTitle, color = c.textPrimary, modifier = Modifier.semantics { heading() })
                if (subtitle != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(subtitle, style = BistroTheme.type.supporting, color = c.textSecondary)
                }
            }
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.xxl, vertical = Spacing.sm),
                content = content,
            )
            if (actions != null) {
                Box(Modifier.padding(horizontal = Spacing.xxl, vertical = Spacing.lg)) { actions() }
            }
        }
    }
}

/**
 * Confirmation for consequential actions. Destructive ones use the danger style and a
 * stronger haptic on confirm.
 */
@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
    loading: Boolean = false,
    body: (@Composable ColumnScope.() -> Unit)? = null,
    confirmEnabled: Boolean = true,
) {
    val haptics = LocalHaptics.current
    val c = BistroTheme.colors
    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        containerColor = c.surface,
        shape = Radii.xl,
        title = { Text(title, style = BistroTheme.type.sectionTitle, color = c.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Text(message, style = BistroTheme.type.body, color = c.textSecondary)
                body?.invoke(this)
            }
        },
        confirmButton = {
            BistroButton(
                text = confirmLabel,
                onClick = {
                    haptics.perform(if (destructive) Haptic.Destructive else Haptic.Confirm)
                    onConfirm()
                },
                style = if (destructive) ButtonStyle.Danger else ButtonStyle.Primary,
                loading = loading,
                enabled = confirmEnabled,
            )
        },
        dismissButton = {
            BistroButton("Cancel", onDismiss, style = ButtonStyle.Ghost, enabled = !loading)
        },
    )
}

/** Two buttons side by side, the common footer of sheets. */
@Composable
fun ActionPair(
    secondary: @Composable () -> Unit,
    primary: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { secondary() }
        Box(Modifier.weight(1.4f)) { primary() }
    }
}

@Composable
fun Gap(size: androidx.compose.ui.unit.Dp) = Spacer(Modifier.size(size))

@Composable
fun HGap(size: androidx.compose.ui.unit.Dp) = Spacer(Modifier.width(size))
