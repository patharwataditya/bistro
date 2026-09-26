package ai.synkrasis.bistro.feature.management

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.BistroIconButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.SegmentedControl
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.component.ToggleRow
import ai.synkrasis.bistro.core.designsystem.component.Tone
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.data.api.PaymentMethod
import ai.synkrasis.bistro.domain.Permission
import ai.synkrasis.bistro.domain.TableStatus
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
private fun SettingsCard(title: String, subtitle: String?, content: @Composable ColumnScope.() -> Unit) {
    BistroCard(Modifier.fillMaxWidth(), elevated = false) {
        SectionHeader(title, subtitle = subtitle)
        Gap(Spacing.md)
        content()
    }
}

/** A switch row that can be read-only (ToggleRow is always interactive). */
@Composable
private fun SwitchRow(title: String, subtitle: String?, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    if (enabled) {
        ToggleRow(title, checked, onChange, subtitle = subtitle)
    } else {
        Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary)
                if (subtitle != null) Text(subtitle, style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
            }
            BistroSwitch(checked, {}, title, enabled = false)
        }
    }
}

@Composable
private fun FieldTitle(text: String) {
    Text(text, style = BistroTheme.type.bodyStrong, color = BistroTheme.colors.textPrimary, modifier = Modifier.padding(top = Spacing.sm, bottom = Spacing.xs))
}

@Composable
fun RestaurantSection(form: GeneralForm, errors: Map<String, String>, canEdit: Boolean, edit: ((GeneralForm) -> GeneralForm) -> Unit) {
    val fullAccess = LocalSession.current.grants.codes.containsAll(Permission.ALL)
    SettingsCard("Restaurant", "Name, place and money") {
        BistroTextField(
            form.restaurantName, { v -> edit { it.copy(restaurantName = v.take(120)) } }, "Restaurant name", Modifier.fillMaxWidth(),
            enabled = canEdit && fullAccess, error = errors["restaurant_name"],
            supporting = if (!fullAccess && canEdit) "Renaming the restaurant needs full access" else "Shown on every location and bill",
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.sm)
        BistroTextField(
            form.locationName, { v -> edit { it.copy(locationName = v.take(120)) } }, "Location name", Modifier.fillMaxWidth(),
            enabled = canEdit, error = errors["location_name"],
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.sm)
        BistroTextField(
            form.address, { v -> edit { it.copy(address = v.take(300)) } }, "Address", Modifier.fillMaxWidth(),
            enabled = canEdit, error = errors["address"], singleLine = false, minLines = 2,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        Gap(Spacing.sm)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            BistroTextField(
                form.timezone, { v -> edit { it.copy(timezone = v.trim().take(64)) } }, "Time zone", Modifier.weight(1f),
                enabled = canEdit, error = errors["timezone"], supporting = "e.g. Europe/London",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
            )
            BistroTextField(
                form.currency,
                { v -> edit { it.copy(currency = v.uppercase().filter { c -> c in 'A'..'Z' }.take(3)) } },
                "Currency", Modifier.width(120.dp),
                enabled = canEdit, error = errors["currency_code"], supporting = "e.g. USD",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false),
            )
        }
    }
}

@Composable
fun BillingSection(form: GeneralForm, errors: Map<String, String>, canEdit: Boolean, edit: ((GeneralForm) -> GeneralForm) -> Unit) {
    SettingsCard("Billing", "How bills are calculated and numbered") {
        BistroTextField(
            form.serviceCharge,
            { v -> if (SettingsInput.percent(v, 2)) edit { it.copy(serviceCharge = v) } },
            "Service charge %", Modifier.fillMaxWidth(),
            enabled = canEdit, error = errors["service_charge_percent"], supporting = "0 for none",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        SwitchRow(
            "Tax the service charge", "Apply taxes on top of the service charge",
            form.serviceChargeTaxable, canEdit,
        ) { v -> edit { it.copy(serviceChargeTaxable = v) } }
        FieldTitle("Round totals to")
        if (canEdit) {
            ChipRow(ROUNDING_OPTIONS, form.rounding, { v -> edit { it.copy(rounding = v) } }, { it }, edgePadding = 0.dp)
        } else {
            Text(form.rounding, style = BistroTheme.type.amount, color = BistroTheme.colors.textPrimary)
        }
        Text(
            "The difference shows on the bill as round-off.",
            style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary, modifier = Modifier.padding(top = Spacing.xs),
        )
        Gap(Spacing.md)
        BistroTextField(
            form.billPrefix,
            { v -> edit { it.copy(billPrefix = v.uppercase().filter { c -> c in 'A'..'Z' || c in '0'..'9' || c == '-' }.take(12)) } },
            "Bill number prefix", Modifier.fillMaxWidth(),
            enabled = canEdit, error = errors["bill_prefix"], supporting = "Printed before each bill number",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false),
        )
        FieldTitle("After a bill is paid, the table is")
        val options = listOf(TableStatus.Available, TableStatus.Cleaning)
        if (canEdit) {
            SegmentedControl(options, form.afterPayment.takeIf { it in options } ?: TableStatus.Available, { v -> edit { it.copy(afterPayment = v) } }, { it.visual.label })
        } else {
            val v = form.afterPayment.visual
            StatusChip(v.label, v.tone, icon = v.icon)
        }
    }
}

@Composable
fun TaxesSection(taxes: List<TaxDraft>, canEdit: Boolean, vm: SettingsViewModel) {
    SettingsCard("Taxes", "Applied to every new bill. Issued bills keep the rates they had.") {
        if (taxes.isEmpty()) {
            Text("No taxes. Bills won't include tax.", style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
        }
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            taxes.forEachIndexed { index, draft ->
                TaxRow(draft, vm.taxError(index) ?: draft.problem(), canEdit, vm)
            }
        }
        if (canEdit) {
            Gap(Spacing.md)
            BistroButton(
                "Add tax", vm::addTax, icon = Icons.Rounded.Add, style = ButtonStyle.Secondary,
                enabled = taxes.size < 10, modifier = Modifier.fillMaxWidth(),
            )
            if (taxes.size >= 10) {
                Text("Up to 10 taxes.", style = BistroTheme.type.metadata, color = BistroTheme.colors.textTertiary)
            }
        }
    }
}

@Composable
private fun TaxRow(draft: TaxDraft, error: String?, canEdit: Boolean, vm: SettingsViewModel) {
    val c = BistroTheme.colors
    Column(Modifier.fillMaxWidth().clip(Radii.md).background(c.surfaceSunken).padding(Spacing.md)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            BistroTextField(
                draft.name, { v -> vm.editTax(draft.key) { it.copy(name = v.take(60)) } }, "Tax name", Modifier.weight(1f),
                enabled = canEdit, placeholder = "e.g. VAT",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            BistroTextField(
                draft.rate, { v -> if (SettingsInput.percent(v, 3)) vm.editTax(draft.key) { it.copy(rate = v) } }, "Rate %",
                Modifier.width(110.dp), enabled = canEdit,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (draft.active) "Active" else "Off — not charged",
                style = BistroTheme.type.supporting, color = c.textSecondary, modifier = Modifier.weight(1f),
            )
            BistroSwitch(draft.active, { v -> vm.editTax(draft.key) { it.copy(active = v) } }, "${draft.name.ifBlank { "Tax" }} active", enabled = canEdit)
            if (canEdit) {
                BistroIconButton(Icons.Rounded.DeleteOutline, "Remove ${draft.name.ifBlank { "tax" }}", { vm.removeTax(draft.key) }, tint = c.danger)
            }
        }
        if (error != null && (draft.name.isNotEmpty() || draft.rate.isNotEmpty() || draft.id != null)) {
            Text(error, style = BistroTheme.type.metadata, color = c.danger)
        }
    }
}

@Composable
fun PaymentMethodsSection(methods: List<PaymentMethod>, canEdit: Boolean, vm: SettingsViewModel) {
    SettingsCard("Payment methods", "What cashiers can take. Changes apply right away.") {
        if (methods.isEmpty()) {
            Text("No payment methods yet. Add one so bills can be paid.", style = BistroTheme.type.supporting, color = BistroTheme.colors.textSecondary)
        }
        methods.sortedBy { it.sortOrder }.forEach { method -> PaymentMethodRow(method, canEdit, vm) }
        if (canEdit) {
            Gap(Spacing.md)
            BistroButton(
                "Add payment method", { vm.addingMethod = true }, icon = Icons.Rounded.Add,
                style = ButtonStyle.Secondary, modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PaymentMethodRow(method: PaymentMethod, canEdit: Boolean, vm: SettingsViewModel) {
    val c = BistroTheme.colors
    val busy = vm.working == "pm-${method.id}"
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Column(Modifier.weight(1f)) {
            Text(method.name, style = BistroTheme.type.bodyStrong, color = if (method.isActive) c.textPrimary else c.textSecondary)
            Text(if (method.isActive) "Offered at checkout" else "Hidden at checkout", style = BistroTheme.type.metadata, color = c.textTertiary)
        }
        if (canEdit) {
            SelectChip("Cash", method.isCash, { vm.setMethodCash(method, !method.isCash) }, enabled = !busy)
        } else if (method.isCash) {
            StatusChip("Cash", Tone.Success, icon = Icons.Rounded.Payments)
        }
        BistroSwitch(method.isActive, { vm.setMethodActive(method, it) }, "${method.name} offered at checkout", enabled = canEdit && !busy)
    }
}

@Composable
fun AddPaymentMethodSheet(busy: Boolean, onAdd: (String, Boolean) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var cash by rememberSaveable { mutableStateOf(false) }
    BistroSheet(
        title = "Add payment method",
        subtitle = "e.g. Card, Mobile wallet, Voucher",
        onDismiss = { if (!busy) onDismiss() },
        actions = {
            BistroButton(
                "Add", { onAdd(name, cash) }, modifier = Modifier.fillMaxWidth(), size = ButtonSize.Large,
                enabled = name.isNotBlank(), loading = busy,
            )
        },
    ) {
        BistroTextField(
            name, { name = it.take(40) }, "Name", Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        ToggleRow("Cash", cash, { cash = it }, subtitle = "Cashiers enter the amount tendered and give change")
        Gap(Spacing.sm)
    }
}
