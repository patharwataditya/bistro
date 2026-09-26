package ai.synkrasis.bistro.core.designsystem.component

import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation

@Composable
fun BistroTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supporting: String? = null,
    error: String? = null,
    leadingIcon: ImageVector? = null,
    prefix: String? = null,
    password: Boolean = false,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    textStyle: TextStyle = BistroTheme.type.body,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val c = BistroTheme.colors
    var revealed by rememberSaveable { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it, color = c.textTertiary) } },
        supportingText = (error ?: supporting)?.let { { Text(it) } },
        isError = error != null,
        leadingIcon = leadingIcon?.let { { Icon(it, null) } },
        prefix = prefix?.let { { Text(it, style = textStyle, color = c.textSecondary) } },
        trailingIcon = if (password) {
            {
                IconButton(onClick = { revealed = !revealed }) {
                    Icon(
                        if (revealed) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                        contentDescription = if (revealed) "Hide password" else "Show password",
                    )
                }
            }
        } else {
            null
        },
        visualTransformation = if (password && !revealed) PasswordVisualTransformation() else VisualTransformation.None,
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        textStyle = textStyle,
        shape = Radii.md,
        keyboardOptions = if (password) keyboardOptions.copy(keyboardType = KeyboardType.Password) else keyboardOptions,
        keyboardActions = keyboardActions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = c.textPrimary,
            unfocusedBorderColor = c.borderStrong,
            focusedLabelColor = c.textPrimary,
            unfocusedLabelColor = c.textSecondary,
            cursorColor = c.accent,
            focusedContainerColor = c.surface,
            unfocusedContainerColor = c.surface,
            disabledContainerColor = c.surfaceSunken,
            errorBorderColor = c.danger,
            errorLabelColor = c.danger,
            errorSupportingTextColor = c.danger,
            focusedLeadingIconColor = c.textSecondary,
            unfocusedLeadingIconColor = c.textTertiary,
        ),
    )
}
