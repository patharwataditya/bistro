package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.core.designsystem.component.ActionPair
import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.ConfirmDialog
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.SegmentedControl
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.core.util.MoneyInput
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.math.BigDecimal

private const val MIN_REASON = 3

/** Every sheet and dialog the bill screen can show; at most one at a time. */
@Composable
fun BillSheets(bill: Bill, vm: BillViewModel) {
    when (vm.sheet) {
        BillSheet.Payment -> PaymentSheet(bill, vm)
        BillSheet.Discount -> DiscountSheet(bill, vm)
        BillSheet.Refund -> RefundSheet(bill, vm)
        BillSheet.Void -> VoidDialog(bill, vm)
        null -> Unit
    }
}

@Composable
private fun DiscountSheet(bill: Bill, vm: BillViewModel) {
    val cur = bill.currencyCode
    val haptics = LocalHaptics.current
    val existing = bill.discountType?.takeIf { it != DiscountType.Unknown }
    var type by rememberSaveable { mutableStateOf(existing ?: DiscountType.Percent) }
    var valueText by rememberSaveable { mutableStateOf(bill.discountValue?.stripTrailingZeros()?.toPlainString().orEmpty()) }
    var reason by rememberSaveable { mutableStateOf(bill.discountReason.orEmpty()) }

    val value = MoneyInput.parse(valueText)
    val valueError = when {
        valueText.isBlank() -> null
        value == null || value.signum() <= 0 -> "Enter a value above zero"
        type == DiscountType.Percent && value > BigDecimal(100) -> "A percentage can't exceed 100"
        type == DiscountType.Fixed && value > bill.subtotal -> "More than the ${Format.money(bill.subtotal, cur)} subtotal"
        else -> null
    }
    val reasonOk = reason.trim().length >= MIN_REASON
    val valid = value != null && value.signum() > 0 && valueError == null && reasonOk

    BistroSheet(
        title = if (existing != null) "Edit discount" else "Discount",
        subtitle = "Subtotal ${Format.money(bill.subtotal, cur)}. Service and tax are recalculated on the new amount.",
        onDismiss = vm::dismissSheet,
        busy = vm.working != null,
        actions = {
            val apply: @Composable () -> Unit = {
                BistroButton(
                    "Apply discount",
                    {
                        haptics.perform(Haptic.Confirm)
                        if (value != null) vm.applyDiscount(type, value, reason)
                    },
                    Modifier.fillMaxWidth(), size = ButtonSize.Large, enabled = valid && vm.working == null,
                    loading = vm.working == "discount",
                )
            }
            if (existing != null) {
                ActionPair(
                    secondary = {
                        BistroButton(
                            "Remove", vm::removeDiscount, Modifier.fillMaxWidth(), style = ButtonStyle.Danger,
                            size = ButtonSize.Large, enabled = vm.working == null, loading = vm.working == "discount-remove",
                        )
                    },
                    primary = apply,
                )
            } else {
                apply()
            }
        },
    ) {
        SegmentedControl(
            options = listOf(DiscountType.Percent, DiscountType.Fixed),
            selected = type,
            onSelect = {
                type = it
                valueText = ""
            },
            label = { if (it == DiscountType.Percent) "Percent" else "Fixed amount" },
        )
        Gap(Spacing.lg)
        BistroTextField(
            value = valueText,
            onValueChange = { if (MoneyInput.accept(it)) valueText = it },
            label = if (type == DiscountType.Percent) "Percent off" else "Amount off",
            modifier = Modifier.fillMaxWidth(),
            prefix = if (type == DiscountType.Fixed) currencySymbol(cur) else null,
            supporting = if (type == DiscountType.Percent) "Percent of the subtotal, e.g. 10" else null,
            error = valueError,
            textStyle = BistroTheme.type.amountLarge,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        Gap(Spacing.sm)
        BistroTextField(
            value = reason,
            onValueChange = { reason = it.take(200) },
            label = "Reason",
            placeholder = "e.g. Regular guest, manager comp",
            supporting = if (reason.isNotEmpty() && !reasonOk) null else "Required · recorded in the audit log",
            error = if (reason.isNotEmpty() && !reasonOk) "At least $MIN_REASON characters" else null,
            modifier = Modifier.fillMaxWidth(),
        )
        Gap(Spacing.sm)
    }
}

@Composable
private fun RefundSheet(bill: Bill, vm: BillViewModel) {
    val cur = bill.currencyCode
    val c = BistroTheme.colors
    val options = bill.refundableByMethod()
    if (options.isEmpty()) {
        BistroSheet(title = "Refund", onDismiss = vm::dismissSheet, busy = vm.working != null) {
            Text("Nothing is held on this bill, so there's nothing to refund.", style = BistroTheme.type.body, color = c.textSecondary)
            Gap(Spacing.xl)
        }
        return
    }
    var methodId by rememberSaveable { mutableIntStateOf(options.first().methodId) }
    val target = options.firstOrNull { it.methodId == methodId } ?: options.first()
    var amountText by rememberSaveable(target.methodId) { mutableStateOf(MoneyInput.display(target.amount)) }
    var reason by rememberSaveable { mutableStateOf("") }
    var confirming by rememberSaveable { mutableStateOf(false) }

    val amount = MoneyInput.parse(amountText)
    val amountError = when {
        amountText.isBlank() -> null
        amount == null || amount.signum() <= 0 -> "Enter an amount above zero"
        amount > target.amount -> "At most ${Format.money(target.amount, cur)} can go back on ${target.methodName}"
        else -> null
    }
    val reasonOk = reason.trim().length >= MIN_REASON
    val valid = amount != null && amount.signum() > 0 && amountError == null && reasonOk
    val correction = bill.status == BillStatus.Open

    BistroSheet(
        title = if (correction) "Correct a payment" else "Refund",
        subtitle = if (correction) {
            "Unwinds a payment taken by mistake so the bill can be fixed or voided."
        } else {
            "Money goes back on the method it was paid with."
        },
        onDismiss = vm::dismissSheet,
        busy = vm.working != null,
        actions = {
            BistroButton(
                text = if (amount != null && valid) "Refund ${Format.money(amount, cur)}" else "Refund",
                onClick = { confirming = true },
                modifier = Modifier.fillMaxWidth(),
                style = ButtonStyle.Danger, size = ButtonSize.Large,
                enabled = valid && vm.working == null,
            )
        },
    ) {
        ChipRow(
            options, target, { methodId = it.methodId },
            { "${it.methodName} · ${Format.money(it.amount, cur)}" }, edgePadding = 0.dp,
        )
        Gap(Spacing.lg)
        BistroTextField(
            value = amountText,
            onValueChange = { if (MoneyInput.accept(it)) amountText = it },
            label = "Amount to refund",
            modifier = Modifier.fillMaxWidth(),
            prefix = currencySymbol(cur),
            supporting = "Up to ${Format.money(target.amount, cur)} on ${target.methodName}",
            error = amountError,
            textStyle = BistroTheme.type.amountLarge,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        Gap(Spacing.sm)
        BistroTextField(
            value = reason,
            onValueChange = { reason = it.take(200) },
            label = "Reason",
            placeholder = if (correction) "e.g. Charged the wrong card" else "e.g. Dish returned",
            error = if (reason.isNotEmpty() && !reasonOk) "At least $MIN_REASON characters" else null,
            supporting = if (reason.isNotEmpty() && !reasonOk) null else "Required · recorded in the audit log",
            modifier = Modifier.fillMaxWidth(),
        )
        Gap(Spacing.sm)
    }

    if (confirming && amount != null) {
        ConfirmDialog(
            title = "Refund ${Format.money(amount, cur)}?",
            message = "${Format.money(amount, cur)} goes back to the guest on ${target.methodName}. This can't be undone.",
            confirmLabel = "Refund",
            destructive = true,
            loading = vm.working == "refund",
            onConfirm = { vm.refund(target, amount, reason) },
            onDismiss = { confirming = false },
        )
    }
}

@Composable
private fun VoidDialog(bill: Bill, vm: BillViewModel) {
    var reason by rememberSaveable { mutableStateOf("") }
    ConfirmDialog(
        title = "Void bill ${bill.billNumber}?",
        message = "The bill is cancelled and check #${bill.orderNumber} opens again for changes. This is recorded in the audit log.",
        confirmLabel = "Void bill",
        destructive = true,
        loading = vm.working == "void",
        confirmEnabled = reason.trim().length >= MIN_REASON,
        onConfirm = { vm.void(reason) },
        onDismiss = vm::dismissSheet,
        body = {
            BistroTextField(reason, { reason = it.take(200) }, "Reason", Modifier.fillMaxWidth(), placeholder = "e.g. Wrong items billed")
        },
    )
}
