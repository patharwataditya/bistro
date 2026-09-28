import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from './cn'

/** Dense, semantic data table for management screens. */
export function DataTable({ children, className, caption }: { children: ReactNode; className?: string; caption: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('t-status sticky top-0 border-b border-line bg-surface px-4 py-3 font-semibold text-fg3', className)} {...rest} />
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('t-body border-b border-line px-4 py-3 align-middle text-fg', className)} {...rest} />
}

export function Tr({ className, interactive, ...rest }: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return <tr className={cn('last:[&>td]:border-b-0', interactive && 'cursor-pointer transition-colors hover:bg-sunken/60', className)} {...rest} />
}
