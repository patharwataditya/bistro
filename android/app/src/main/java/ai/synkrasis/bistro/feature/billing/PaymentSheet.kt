package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.core.designsystem.component.BistroButton
import ai.synkrasis.bistro.core.designsystem.component.BistroSheet
import ai.synkrasis.bistro.core.designsystem.component.BistroTextField
import ai.synkrasis.bistro.core.designsystem.component.ButtonSize
import ai.synkrasis.bistro.core.designsystem.component.ButtonStyle
import ai.synkrasis.bistro.core.designsystem.component.ChipRow
import ai.synkrasis.bistro.core.designsystem.component.ErrorState
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.Skeleton
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.haptics.Haptic
import ai.synkrasis.bistro.core.haptics.LocalHaptics
import ai.synkrasis.bistro.core.ui.LoadState
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.core.util.MoneyInput
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.PaymentMethod
import ai.synkrasis.bistro.domain.PaymentKind
import ai.synkrasis.bistro.feature.common.AmountLine
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.math.BigDecimal

@Composable
fun PaymentSheet(bill: Bill, vm: BillViewModel) {
    val settled = vm.settled
    BistroSheet(
        title = if (settled != null) "Bill settled" else "Take payment",
        subtitle = if (settled != null) null else "Bill ${bill.billNumber} · Table ${bill.tableName}",
        onDismiss = { if (settled != null) vm.finish() else vm.dismissSheet() },
        actions = if (settled != null) {
            { BistroButton("Done", vm::finish, Modifier.fillMaxWidth(), size = ButtonSize.Large) }
        } else {
            null
        },
    ) {
        if (settled != null) {
            PaidInFull(settled)
        } else {
            PaymentForm(bill, vm)
        }
    }
}

@Composable
private fun PaymentForm(bill: Bill, vm: BillViewModel) {
    val c = BistroTheme.colors
    val cur = bill.currencyCode
    when (val m = vm.methods) {
        LoadState.Loading -> {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                repeat(3) { Skeleton(Modifier.width(88.dp), 40.dp) }
            }
            Gap(Spacing.xl)
        }
        is LoadState.Failed -> ErrorState(m.error, vm::loadMethods)
        is LoadState.Ready -> if (m.data.isEmpty()) {
            Text(
                "No payment methods are active. A manager can add one in Settings → Payment methods.",
                style = BistroTheme.type.body, color = c.textSecondary,
            )
            Gap(Spacing.xl)
        } else {
            PaymentFields(bill, m.data, vm)
        }
    }
    AmountLine("Balance due", Format.money(bill.balanceDue, cur), color = c.textSecondary)
}

@Composable
private fun PaymentFields(bill: Bill, methods: List<PaymentMethod>, vm: BillViewModel) {
    val haptics = LocalHaptics.current
    val cur = bill.currencyCode
    var methodId by rememberSaveable { mutableIntStateOf(methods.first().id) }
    var amountText by rememberSaveable { mutableStateOf(MoneyInput.display(bill.balanceDue)) }
    var tenderedText by rememberSaveable { mutableStateOf("") }
    var reference by rememberSaveable { mutableStateOf("") }
    val method = methods.firstOrNull { it.id == methodId } ?: methods.first()

    val amount = MoneyInput.parse(amountText)
    val amountError = when {
        amountText.isBlank() -> null
        amount == null || amount.signum() <= 0 -> "Enter an amount above zero"
        amount > bill.balanceDue -> "That's more than the ${Format.money(bill.balanceDue, cur)} due"
        else -> null
    }
    val tendered = if (method.isCash) MoneyInput.parse(tenderedText) else null
    val tenderedError = if (tendered != null && amount != null && tendered < amount) "Less than the amount being paid" else null
    val valid = amount != null && amount.signum() > 0 && amountError == null && tenderedError == null

    ChipRow(methods, method, { methodId = it.id }, { it.name }, edgePadding = 0.dp)
    Gap(Spacing.lg)
    BistroTextField(
        value = amountText,
        onValueChange = { if (MoneyInput.accept(it)) amountText = it },
        label = "Amount",
        modifier = Modifier.fillMaxWidth(),
        prefix = currencySymbol(cur),
        error = amountError,
        supporting = if (amount != null && amountError == null && amount < bill.balanceDue) {
            "Split payment · ${Format.money(bill.balanceDue - amount, cur)} will remain due"
        } else {
            null
        },
        textStyle = BistroTheme.type.amountLarge,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    )
    AnimatedVisibility(method.isCash, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
        CashFields(
            amount = amount?.takeIf { amountError == null },
            tenderedText = tenderedText,
            onTendered = { tenderedText = it },
            tenderedError = tenderedError,
            currency = cur,
        )
    }
    AnimatedVisibility(!method.isCash, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
        Column {
            Gap(Spacing.md)
            BistroTextField(
                value = reference,
                onValueChange = { reference = it.take(80) },
                label = "Reference (optional)",
                placeholder = "Card slip or UPI transaction id",
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    Gap(Spacing.lg)
    BistroButton(
        text = if (amount != null && valid) "Charge ${Format.money(amount, cur)}" else "Charge",
        onClick = {
            if (amount == null) return@BistroButton
            haptics.perform(Haptic.Confirm)
            vm.pay(method, amount, tendered, reference.takeIf { !method.isCash })
        },
        icon = Icons.Rounded.Payments,
        style = ButtonStyle.Accent,
        size = ButtonSize.Large,
        enabled = valid,
        loading = vm.working == "pay",
        modifier = Modifier.fillMaxWidth(),
    )
    Gap(Spacing.md)
}

@Composable
private fun CashFields(
    amount: BigDecimal?,
    tenderedText: String,
    onTendered: (String) -> Unit,
    tenderedError: String?,
    currency: String,
) {
    val c = BistroTheme.colors
    val haptics = LocalHaptics.current
    val tendered = MoneyInput.parse(tenderedText)
    Column {
        Gap(Spacing.md)
        BistroTextField(
            value = tenderedText,
            onValueChange = { if (MoneyInput.accept(it)) onTendered(it) },
            label = "Cash tendered (optional)",
            modifier = Modifier.fillMaxWidth(),
            prefix = currencySymbol(currency),
            error = tenderedError,
            textStyle = BistroTheme.type.amount,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        )
        if (amount != null) {
            Gap(Spacing.sm)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                quickTenders(amount).forEachIndexed { i, value ->
                    TenderChip(
                        label = if (i == 0) "Exact" else Format.money(value, currency),
                        selected = tendered != null && tendered.compareTo(value) == 0,
                        onClick = {
                            haptics.perform(Haptic.Selection)
                            onTendered(MoneyInput.display(value))
                        },
                    )
                }
            }
        }
        // Shown for the cashier only; the server computes and records the real change.
        val change = if (amount != null && tendered != null && tenderedError == null) tendered - amount else null
        if (change != null) {
            Gap(Spacing.md)
            Row(
                Modifier.fillMaxWidth().clip(Radii.md).background(c.surfaceSunken).padding(Spacing.md)
                    .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Change due", style = BistroTheme.type.bodyStrong, color = c.textSecondary, modifier = Modifier.weight(1f))
                Text(Format.money(change, currency), style = BistroTheme.type.amountLarge, color = c.textPrimary)
            }
        }
    }
}

@Composable
private fun TenderChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = BistroTheme.colors
    val bg by animateColorAsState(if (selected) c.ink else c.surface, Motion.fast(), label = "tender-bg")
    val fg by animateColorAsState(if (selected) c.onInk else c.textPrimary, Motion.fast(), label = "tender-fg")
    Box(
        Modifier.height(Spacing.touchTarget).clip(Radii.pill).background(bg)
            .border(1.dp, if (selected) bg else c.border, Radii.pill)
            .selectable(selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = Spacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = BistroTheme.type.amountSmall, color = fg)
    }
}

/** The settled moment: a check that draws itself, and the change to hand back if any. */
@Composable
private fun PaidInFull(bill: Bill) {
    val c = BistroTheme.colors
    val cur = bill.currencyCode
    val last = bill.payments.lastOrNull { it.kind == PaymentKind.Payment }
    Column(
        Modifier.fillMaxWidth().padding(vertical = Spacing.lg).semantics(mergeDescendants = true) {
            liveRegion = LiveRegionMode.Polite
        },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AnimatedCheck()
        Gap(Spacing.lg)
        Text("Paid in full", style = BistroTheme.type.pageTitle, color = c.textPrimary, textAlign = TextAlign.Center)
        Text(
            "${Format.money(bill.total, cur)} · Table ${bill.tableName} is being released",
            style = BistroTheme.type.supporting, color = c.textSecondary, textAlign = TextAlign.Center,
        )
        if (last?.tendered != null && last.changeDue.signum() > 0) {
            Gap(Spacing.xl)
            Text("GIVE CHANGE", style = BistroTheme.type.statusLabel, color = c.textTertiary)
            Text(Format.money(last.changeDue, cur), style = BistroTheme.type.amountHero, color = c.textPrimary)
        }
    }
}

@Composable
private fun AnimatedCheck() {
    val c = BistroTheme.colors
    val scale = remember { Animatable(0.6f) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        launch { scale.animateTo(1f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMediumLow)) }
        delay(Motion.FAST.toLong())
        progress.animateTo(1f, tween(Motion.EMPHASIZED, easing = Motion.EmphasizedDecelerate))
    }
    val ring = c.successSoft
    val disc = c.success
    val mark = c.surface
    Canvas(
        Modifier.size(96.dp)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
            }
            .semantics { contentDescription = "Payment complete" },
    ) {
        val w = size.width
        val h = size.height
        drawCircle(ring)
        drawCircle(disc, radius = size.minDimension * 0.36f)
        val a = Offset(w * 0.35f, h * 0.51f)
        val b = Offset(w * 0.46f, h * 0.62f)
        val d = Offset(w * 0.66f, h * 0.41f)
        val l1 = (b - a).getDistance()
        val l2 = (d - b).getDistance()
        val drawn = (l1 + l2) * progress.value
        val stroke = w * 0.065f
        if (drawn > 0f) {
            val end1 = if (drawn < l1) a + (b - a) * (drawn / l1) else b
            drawLine(mark, a, end1, strokeWidth = stroke, cap = StrokeCap.Round)
        }
        if (drawn > l1) {
            drawLine(mark, b, b + (d - b) * ((drawn - l1) / l2), strokeWidth = stroke, cap = StrokeCap.Round)
        }
    }
}

/** The currency's own symbol for input prefixes ("₹", "$"), falling back to its code. */
fun currencySymbol(code: String): String =
    runCatching { java.util.Currency.getInstance(code).getSymbol(java.util.Locale.getDefault()) }.getOrDefault(code)
