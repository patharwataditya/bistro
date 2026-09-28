import type { Totals } from '@/api/types'
import { isZero, money, percent, signedMoney } from '@/lib/format'
import { Card } from '@/ui/Card'
import { Divider } from '@/ui/Overlay'
import { AmountLine } from '@/ui/Page'

/**
 * The breakdown staff and guests read. Every figure comes from the server; the web app
 * never recalculates money.
 */
export function TotalsCard({ totals, currency, estimate, className }: { totals: Totals; currency: string; estimate: boolean; className?: string }) {
  return (
    <Card flat className={className ?? 'p-5'}>
      <AmountLine label="Subtotal" amount={money(totals.subtotal, currency)} />
      {!isZero(totals.discount_amount) && <AmountLine label="Discount" amount={`−${money(totals.discount_amount, currency)}`} tone="success" />}
      {!isZero(totals.service_charge_amount) && (
        <AmountLine label={`Service charge (${percent(totals.service_charge_percent)})`} amount={money(totals.service_charge_amount, currency)} />
      )}
      {totals.taxes.map((t) => (
        <AmountLine key={t.name} label={`${t.name} (${percent(t.rate_percent)})`} amount={money(t.amount, currency)} />
      ))}
      {!isZero(totals.round_off) && <AmountLine label="Rounding" amount={signedMoney(totals.round_off, currency)} />}
      <Divider className="my-3" />
      <AmountLine label={estimate ? 'Total (before bill)' : 'Total'} amount={money(totals.total, currency)} strong />
    </Card>
  )
}
