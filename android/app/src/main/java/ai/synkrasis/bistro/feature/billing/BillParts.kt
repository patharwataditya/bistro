package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.core.designsystem.component.AnimatedCounter
import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.Gap
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.component.SectionHeader
import ai.synkrasis.bistro.core.designsystem.component.StatusChip
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Motion
import ai.synkrasis.bistro.core.designsystem.theme.Radii
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.PaymentRecord
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.DiscountType
import ai.synkrasis.bistro.domain.PaymentKind
import ai.synkrasis.bistro.domain.visual
import ai.synkrasis.bistro.navigation.LocalSession
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LocalOffer
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import java.math.BigDecimal
import java.math.RoundingMode

/** The number that matters most for this bill's state, as large as the screen allows. */
@Composable
fun BillHero(bill: Bill, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    val cur = bill.currencyCode
    val v = bill.status.visual
    val (label, amount) = when (bill.status) {
        BillStatus.Open -> "Balance due" to bill.balanceDue
        BillStatus.Void -> "Voided" to bill.total
        else -> "Paid" to bill.total
    }
    val description = buildString {
        append("$label ${Format.money(amount, cur)}. ${v.label}. ")
        append("Total ${Format.money(bill.total, cur)}, paid ${Format.money(bill.netPaid, cur)}.")
    }
    Column(modifier.fillMaxWidth().padding(vertical = Spacing.sm).clearAndSetSemantics { contentDescription = description }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label.uppercase(), style = BistroTheme.type.statusLabel, color = c.textTertiary, modifier = Modifier.weight(1f))
            StatusChip(v.label, v.tone, icon = v.icon)
        }
        Gap(Spacing.xs)
        AnimatedCounter(
            text = Format.money(amount, cur),
            style = BistroTheme.type.amountHero.copy(
                textDecoration = if (bill.status == BillStatus.Void) TextDecoration.LineThrough else null,
            ),
            color = if (bill.status == BillStatus.Void) c.textTertiary else c.textPrimary,
        )
        Gap(Spacing.xs)
        HeroFootnote(bill, session.zone)
        if (bill.status == BillStatus.Open && bill.total.signum() > 0) {
            Gap(Spacing.md)
            PaidProgress(bill.netPaid, bill.total)
        }
    }
}

@Composable
private fun HeroFootnote(bill: Bill, zone: java.time.ZoneId) {
    val c = BistroTheme.colors
    val cur = bill.currencyCode
    val style = BistroTheme.type.amountSmall
    when (bill.status) {
        BillStatus.Open -> Text(
            "Total ${Format.money(bill.total, cur)} · Paid ${Format.money(bill.netPaid, cur)}",
            style = style, color = c.textSecondary,
        )
        BillStatus.Void -> Column {
            bill.voidedAt?.let { Text("Voided ${Format.dateTime(it, zone)}", style = style, color = c.textSecondary) }
            bill.voidReason?.let { Text("“$it”", style = BistroTheme.type.supporting.copy(fontStyle = FontStyle.Italic), color = c.textSecondary) }
        }
        else -> Column {
            bill.paidAt?.let { Text("Settled ${Format.dateTime(it, zone)}", style = style, color = c.textSecondary) }
            if (bill.refundedTotal.signum() > 0) {
                Text(
                    "Refunded ${Format.money(bill.refundedTotal, cur)} · Net ${Format.money(bill.netPaid, cur)}",
                    style = style, color = c.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun PaidProgress(paid: BigDecimal, total: BigDecimal) {
    val c = BistroTheme.colors
    val target = paid.divide(total, 4, RoundingMode.HALF_UP).toFloat().coerceIn(0f, 1f)
    val fraction by animateFloatAsState(target, Motion.standard(), label = "paid-progress")
    Box(Modifier.fillMaxWidth().height(6.dp).clip(Radii.pill).background(c.surfaceSunken)) {
        if (fraction > 0f) Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().clip(Radii.pill).background(c.success))
    }
}

/** How the discount was set and why: the totals card shows only its amount. */
@Composable
fun DiscountDetail(bill: Bill) {
    val type = bill.discountType ?: return
    if (bill.discountAmount.signum() <= 0) return
    val c = BistroTheme.colors
    val value = bill.discountValue
    val how = when {
        value == null -> "Discount"
        type == DiscountType.Percent -> "${Format.percent(value)} off"
        else -> "${Format.money(value, bill.currencyCode)} off"
    }
    Row(
        Modifier.fillMaxWidth().clip(Radii.md).background(c.successSoft).padding(Spacing.md)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Icon(Icons.Rounded.LocalOffer, null, tint = c.success, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(how, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
            bill.discountReason?.let {
                Text("“$it”", style = BistroTheme.type.supporting.copy(fontStyle = FontStyle.Italic), color = c.textSecondary)
            }
        }
        Text("−" + Format.money(bill.discountAmount, bill.currencyCode), style = BistroTheme.type.amount, color = c.success)
    }
}

@Composable
fun PaymentsSection(bill: Bill, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    val cur = bill.currencyCode
    Column(modifier.fillMaxWidth()) {
        SectionHeader(
            title = "Payments",
            subtitle = if (bill.payments.isEmpty()) {
                null
            } else {
                buildString {
                    append("${Format.money(bill.paidTotal, cur)} taken")
                    if (bill.refundedTotal.signum() > 0) append(" · ${Format.money(bill.refundedTotal, cur)} returned")
                }
            },
        )
        Gap(Spacing.sm)
        BistroCard(Modifier.fillMaxWidth(), elevated = false) {
            if (bill.payments.isEmpty()) {
                Text(
                    when (bill.status) {
                        BillStatus.Open -> "No payments yet. Take a payment to settle the bill — split tender is fine."
                        BillStatus.Void -> "No money was taken on this bill."
                        else -> "Settled without a payment (nothing was due)."
                    },
                    style = BistroTheme.type.supporting, color = c.textSecondary,
                )
            }
            bill.payments.forEachIndexed { index, payment ->
                if (index > 0) HairlineDivider(Modifier.padding(vertical = Spacing.xs))
                PaymentRow(payment, cur)
            }
        }
    }
}

@Composable
private fun PaymentRow(p: PaymentRecord, currency: String) {
    val c = BistroTheme.colors
    val session = LocalSession.current
    val refund = p.kind == PaymentKind.Refund
    val kindLabel = when {
        refund && p.isCorrection -> "Correction"
        refund -> "Refund"
        else -> null
    }
    val amountText = (if (refund) "−" else "") + Format.money(p.amount, currency)
    Row(
        Modifier.fillMaxWidth().padding(vertical = Spacing.sm).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Box(
            Modifier.size(36.dp).clip(Radii.sm).background(if (refund) c.dangerSoft else c.surfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (refund) Icons.Rounded.Undo else Icons.Rounded.Payments, null,
                tint = if (refund) c.danger else c.textSecondary, modifier = Modifier.size(18.dp),
            )
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Text(p.methodName, style = BistroTheme.type.bodyStrong, color = c.textPrimary)
                if (kindLabel != null) {
                    Text(
                        kindLabel.uppercase(), style = BistroTheme.type.statusLabel, color = c.danger,
                        modifier = Modifier.clip(Radii.xs).background(c.dangerSoft).padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Text(
                "${p.createdByName.ifBlank { "Staff" }} · ${Format.time(p.createdAt, session.zone)}",
                style = BistroTheme.type.metadata, color = c.textTertiary,
            )
            p.tendered?.let { tendered ->
                Text(
                    "Tendered ${Format.money(tendered, currency)} · Change ${Format.money(p.changeDue, currency)}",
                    style = BistroTheme.type.amountSmall, color = c.textSecondary,
                )
            }
            p.reference?.let { Text("Ref $it", style = BistroTheme.type.identifier, color = c.textSecondary) }
            p.reason?.let {
                Text("“$it”", style = BistroTheme.type.supporting.copy(fontStyle = FontStyle.Italic), color = c.textSecondary)
            }
        }
        Text(amountText, style = BistroTheme.type.amount, color = if (refund) c.danger else c.textPrimary)
    }
}
