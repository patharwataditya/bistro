import { NotebookPen, Search, SearchX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Menu, MenuItem } from '@/api/types'
import { money } from '@/lib/format'
import { CountBadge, StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { ChipRow, Stepper } from '@/ui/Controls'
import { TextArea } from '@/ui/Field'
import { EmptyState, Skeleton } from '@/ui/States'
import { FormDialog, QuickNotes } from './FormDialog'
import { appendNote, filterMenu, lineTotal, MAX_QTY, QUICK_NOTES, sortMenuItems } from './orderModel'

/**
 * Fast item entry: category rail (a chip row below 1280 px), search, and a grid where one
 * click adds one to the new items. Renders two grid children: the rail and the grid.
 */
export function MenuBrowser({ menu, currency, quantityOf, onAdd, className }: {
  menu: Menu
  currency: string
  quantityOf: (menuItemId: number) => number
  onAdd: (item: MenuItem, quantity: number, note: string) => void
  className?: string
}) {
  const [category, setCategory] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [noteFor, setNoteFor] = useState<MenuItem | null>(null)
  const search = useRef<HTMLInputElement>(null)

  // "/" jumps to search, like most desktop tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      // Not while a dialog or a menu is open: "/" there belongs to it (e.g. typeahead).
      if (t?.closest('[role="menu"],[role="menubar"],[role="listbox"]')) return
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]')) return
      e.preventDefault()
      search.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sorted = useMemo(() => sortMenuItems(menu.items, menu.categories), [menu])
  const visible = filterMenu(sorted, category, query)
  const categoryOptions: (number | null)[] = [null, ...menu.categories.map((c) => c.id)]
  const categoryName = (id: number | null) => (id === null ? 'All' : (menu.categories.find((c) => c.id === id)?.name ?? ''))

  // In "All" without a search the grid reads like a printed menu, one heading per category.
  const groups = category === null && query.trim() === ''
    ? menu.categories
      .map((c) => ({ key: String(c.id), title: c.name as string | null, items: visible.filter((i) => i.category_id === c.id) }))
      .concat([{ key: 'other', title: null, items: visible.filter((i) => !menu.categories.some((c) => c.id === i.category_id)) }])
      .filter((g) => g.items.length > 0)
    : [{ key: 'all', title: null, items: visible }]

  return (
    <>
      <nav aria-label="Menu categories" className="sticky top-20 hidden self-start xl:block">
        <div role="radiogroup" aria-label="Category" className="flex flex-col gap-1">
          {categoryOptions.map((id) => {
            const selected = id === category
            const count = id === null ? menu.items.length : menu.items.filter((i) => i.category_id === id).length
            return (
              <button
                key={id ?? 'all'}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategory(id)}
                className={cn(
                  'flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-4 text-left text-[14px] font-semibold transition-[background-color,color] duration-150',
                  selected ? 'bg-ink text-on-ink' : 'text-fg2 hover:bg-[var(--hover-overlay)] hover:text-fg',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{categoryName(id)}</span>
                <span className={cn('t-meta', selected ? 'opacity-70' : 'text-fg3')}>{count}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <section aria-label="Menu" className={cn('flex min-w-0 flex-col gap-4', className)}>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg3" />
          <input
            ref={search}
            type="search"
            aria-label="Search the menu"
            placeholder="Search the menu"
            value={query}
            maxLength={40}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                setQuery('')
              }
            }}
            className="t-body h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface pr-12 pl-10 text-fg outline-none placeholder:text-fg3 focus:border-fg [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-fg2 hover:bg-[var(--hover-overlay)]">
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <kbd aria-hidden className="t-meta pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-[var(--radius-xs)] border border-line px-1.5 text-fg3 lg:block">/</kbd>
          )}
        </div>
        <ChipRow
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          label={categoryName}
          keyOf={(id) => String(id ?? 'all')}
          ariaLabel="Category"
          className="lg:flex-wrap xl:hidden"
        />
        {visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={menu.items.length === 0 ? 'The menu is empty' : 'Nothing matches'}
            message={menu.items.length === 0 ? 'A manager needs to add menu items first.' : 'Try another word or category.'}
          />
        ) : (
          groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-3">
              {g.title && groups.length > 1 && <h2 className="t-status pt-1 text-fg3">{g.title}</h2>}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {g.items.map((item) => (
                  <li key={item.id} className="flex">
                    <MenuItemCard
                      item={item}
                      currency={currency}
                      inCart={quantityOf(item.id)}
                      onAdd={() => onAdd(item, 1, '')}
                      onAddWithNote={() => setNoteFor(item)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <AddWithNoteDialog
        item={noteFor}
        currency={currency}
        onClose={() => setNoteFor(null)}
        onAdd={(q, note) => {
          if (noteFor) onAdd(noteFor, q, note)
          setNoteFor(null)
        }}
      />
    </>
  )
}

function MenuItemCard({ item, currency, inCart, onAdd, onAddWithNote }: {
  item: MenuItem
  currency: string
  inCart: number
  onAdd: () => void
  onAddWithNote: () => void
}) {
  const available = item.is_available
  const label = `${item.name}, ${money(item.price, currency)}${available ? '' : ', sold out'}${inCart > 0 ? `, ${inCart} in new items` : ''}`
  return (
    <div
      className={cn(
        'group relative flex min-h-[112px] w-full flex-col rounded-[var(--radius-lg)] border transition-[border-color,background-color] duration-150',
        !available ? 'border-line bg-sunken/50' : inCart > 0 ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface shadow-card hover:border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={onAdd}
        disabled={!available}
        aria-label={available ? `Add one ${label}` : label}
        onContextMenu={(e) => {
          if (!available) return
          e.preventDefault()
          onAddWithNote()
        }}
        className="flex flex-1 flex-col items-start gap-1 rounded-[var(--radius-lg)] p-3.5 text-left transition-transform duration-150 enabled:active:scale-[0.98]"
      >
        <span className={cn('t-body-strong line-clamp-2 pr-6', available ? 'text-fg' : 'text-fg-disabled')}>{item.name}</span>
        {item.description && <span className="t-support line-clamp-1 text-fg2">{item.description}</span>}
        <span className="mt-auto flex w-full items-center gap-2 pt-1">
          <span className={cn('t-amount-sm', available ? 'text-fg' : 'text-fg-disabled')}>{money(item.price, currency)}</span>
          {!available && <StatusChip label="Sold out" tone="neutral" className="ml-auto" />}
        </span>
      </button>
      {inCart > 0 && (
        <span aria-hidden className="pointer-events-none absolute top-3 right-3">
          <CountBadge count={inCart} />
        </span>
      )}
      {available && (
        <button
          type="button"
          onClick={onAddWithNote}
          aria-label={`Add ${item.name} with a note`}
          title="Add with note"
          className="absolute right-1.5 bottom-1.5 inline-flex size-9 items-center justify-center rounded-full text-fg3 transition-colors hover:bg-[var(--hover-overlay)] hover:text-fg"
        >
          <NotebookPen aria-hidden className="size-[18px]" />
        </button>
      )}
    </div>
  )
}

function AddWithNoteDialog({ item, currency, onClose, onAdd }: {
  item: MenuItem | null
  currency: string
  onClose: () => void
  onAdd: (quantity: number, note: string) => void
}) {
  const [forId, setForId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  // A fresh form for each item (adjusting state while rendering, not in an effect).
  if (item && item.id !== forId) {
    setForId(item.id)
    setQuantity(1)
    setNote('')
  }
  return (
    <FormDialog
      open={item !== null}
      onOpenChange={(o) => {
        if (o) return
        setForId(null)
        onClose()
      }}
      title={item?.name ?? ''}
      description={item ? [money(item.price, currency), item.description].filter(Boolean).join(' · ') : undefined}
      submitLabel={
        <>
          Add to cart <span className="opacity-75">· {item ? money(lineTotal(item.price, quantity), currency) : ''}</span>
        </>
      }
      onSubmit={() => {
        onAdd(quantity, note)
        setForId(null)
      }}
    >
      <div className="flex items-center gap-3">
        <span className="t-body-strong flex-1 text-fg">Quantity</span>
        <Stepper value={quantity} onChange={setQuantity} min={1} max={MAX_QTY} label="Quantity" />
      </div>
      <QuickNotes notes={QUICK_NOTES} onPick={(q) => setNote((n) => appendNote(n, q).slice(0, 200))} />
      <TextArea label="Note for the kitchen" placeholder="e.g. No onions, extra spicy" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  )
}

export function MenuSkeleton() {
  return (
    <div role="status" aria-label="Loading the menu" className="flex flex-col gap-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[112px] rounded-[var(--radius-lg)]" />)}
      </div>
    </div>
  )
}
