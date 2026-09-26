package ai.synkrasis.bistro.feature.billing

import ai.synkrasis.bistro.data.api.Bill
import ai.synkrasis.bistro.data.api.Totals
import ai.synkrasis.bistro.domain.BillStatus
import ai.synkrasis.bistro.domain.PaymentKind
import java.math.BigDecimal
import java.math.RoundingMode

/*
 * Read-only views over server figures. Nothing here decides an amount the server will
 * charge; these only choose what to show and which actions to offer.
 */

/** Money held on the bill: payments minus refunds. */
val Bill.netPaid: BigDecimal get() = paidTotal - refundedTotal

val Bill.hasNetPayment: Boolean get() = netPaid.signum() > 0

/** Bill → the shared breakdown DTO, so the bill reuses [ai.synkrasis.bistro.feature.common.TotalsCard]. */
fun Bill.toTotals(): Totals = Totals(
    subtotal = subtotal,
    discountAmount = discountAmount,
    serviceChargePercent = serviceChargePercent,
    serviceChargeAmount = serviceChargeAmount,
    taxes = taxes,
    taxTotal = taxTotal,
    roundOff = roundOff,
    total = total,
)

/** One method's money on this bill, which is also the most that can go back on it. */
data class Refundable(val methodId: Int, val methodName: String, val amount: BigDecimal)

/** Mirrors the server's per-method cap: refunds go back only on the method the money came in on. */
fun Bill.refundableByMethod(): List<Refundable> =
    payments.groupBy { it.paymentMethodId }.mapNotNull { (id, records) ->
        val held = records.fold(BigDecimal.ZERO) { acc, p ->
            when (p.kind) {
                PaymentKind.Payment -> acc + p.amount
                PaymentKind.Refund -> acc - p.amount
                PaymentKind.Unknown -> acc
            }
        }
        if (held.signum() > 0) Refundable(id, records.last().methodName, held) else null
    }

/** Which actions a bill's state allows (permissions are checked separately). */
val Bill.canTakePayment: Boolean get() = status == BillStatus.Open && balanceDue.signum() > 0
val Bill.canSettleZero: Boolean get() = status == BillStatus.Open && total.signum() == 0
val Bill.canDiscount: Boolean get() = status == BillStatus.Open && !hasNetPayment
val Bill.canVoid: Boolean get() = status == BillStatus.Open && !hasNetPayment
val Bill.canRefund: Boolean
    get() = (status == BillStatus.Paid || status == BillStatus.PartiallyRefunded || status == BillStatus.Open) &&
        refundableByMethod().isNotEmpty()

/** Cash quick-tender suggestions: the exact amount, then the next few round notes above it. */
fun quickTenders(amount: BigDecimal): List<BigDecimal> {
    if (amount.signum() <= 0) return emptyList()
    val exact = amount.setScale(2, RoundingMode.HALF_UP)
    val rounded = listOf(10, 50, 100, 500, 1000, 2000).map { step ->
        val s = BigDecimal(step)
        exact.divide(s, 0, RoundingMode.CEILING).multiply(s).setScale(2)
    }.filter { it > exact }.distinct().sorted().take(3)
    return listOf(exact) + rounded
}
