package ai.synkrasis.bistro.feature.common

import ai.synkrasis.bistro.core.designsystem.component.BistroCard
import ai.synkrasis.bistro.core.designsystem.component.HairlineDivider
import ai.synkrasis.bistro.core.designsystem.theme.BistroTheme
import ai.synkrasis.bistro.core.designsystem.theme.Spacing
import ai.synkrasis.bistro.core.util.Format
import ai.synkrasis.bistro.data.api.Totals
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import java.math.BigDecimal

/** Line in a money breakdown: label left, amount right, tabular figures. */
@Composable
fun AmountLine(
    label: String,
    amount: String,
    modifier: Modifier = Modifier,
    labelStyle: TextStyle = BistroTheme.type.body,
    amountStyle: TextStyle = BistroTheme.type.amount,
    color: Color = BistroTheme.colors.textSecondary,
    amountColor: Color = BistroTheme.colors.textPrimary,
) {
    Row(modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = labelStyle, color = color, modifier = Modifier.weight(1f))
        Text(amount, style = amountStyle, color = amountColor)
    }
}


/**
 * The breakdown staff and guests read: subtotal, discount, service, each tax, rounding and
 * the total. All figures come from the server; the app never recalculates money.
 */
@Composable
fun TotalsCard(totals: Totals, currency: String, estimate: Boolean, modifier: Modifier = Modifier) {
    val c = BistroTheme.colors
    BistroCard(modifier.fillMaxWidth(), elevated = false, container = c.surface) {
        AmountLine("Subtotal", Format.money(totals.subtotal, currency))
        if (totals.discountAmount.signum() > 0) {
            AmountLine("Discount", "−" + Format.money(totals.discountAmount, currency), amountColor = c.success)
        }
        if (totals.serviceChargeAmount.signum() > 0) {
            AmountLine("Service charge (${Format.percent(totals.serviceChargePercent)})", Format.money(totals.serviceChargeAmount, currency))
        }
        totals.taxes.forEach { tax ->
            AmountLine("${tax.name} (${Format.percent(tax.ratePercent)})", Format.money(tax.amount, currency))
        }
        if (totals.roundOff.compareTo(BigDecimal.ZERO) != 0) {
            AmountLine("Rounding", Format.signedMoney(totals.roundOff, currency))
        }
        HairlineDivider(Modifier.padding(vertical = Spacing.sm))
        AmountLine(
            label = if (estimate) "Total (before bill)" else "Total",
            amount = Format.money(totals.total, currency),
            labelStyle = BistroTheme.type.cardTitle,
            amountStyle = BistroTheme.type.amountLarge,
            color = c.textPrimary,
        )
    }
}
