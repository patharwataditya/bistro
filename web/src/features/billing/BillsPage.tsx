import { ReceiptText } from 'lucide-react'
import { useParams } from 'react-router'
import { cn } from '@/ui/cn'
import { EmptyState } from '@/ui/States'
import { BillDetail } from './BillDetail'
import { BillList } from './BillList'

/**
 * Bills: a split view at ≥1024 px (list 400 px on the left, the selected bill on the right);
 * on narrower screens the list and the bill each take the full width, like Android's pushed
 * BillRoute. The selected bill lives in the URL (/bills/:billId).
 */
export default function BillsPage() {
  const { billId } = useParams()
  const parsed = billId ? Number(billId) : NaN
  const selected = Number.isInteger(parsed) && parsed > 0 ? parsed : null

  return (
    <div className="lg:grid lg:h-[calc(100dvh-7rem)] lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6">
      <div className={cn('min-h-0 flex-col', selected !== null ? 'hidden lg:flex' : 'flex')}>
        <BillList selectedId={selected} />
      </div>
      <div className={cn('min-h-0 min-w-0 lg:overflow-y-auto lg:pr-1', selected === null && 'hidden lg:block')}>
        {selected !== null ? (
          <BillDetail key={selected} billId={selected} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line">
            <EmptyState icon={ReceiptText} title="Select a bill" message="Pick a bill from the list to see its breakdown and payments, or to take a payment." />
          </div>
        )}
      </div>
    </div>
  )
}
