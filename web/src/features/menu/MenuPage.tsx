import { BookOpen, CircleCheck, CircleMinus, FolderTree, LayoutList, Plus, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MenuItem } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { RowOpen, rowProps, SearchInput, TableSkeleton, Toolbar } from '@/features/staff/manage-kit'
import { money } from '@/lib/format'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { ChipRow, Switch } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, StaleBanner } from '@/ui/States'
import { DataTable, Td, Th, Tr } from '@/ui/Table'
import { useMenuManage } from './api'
import { MenuCategoriesDrawer } from './MenuCategoriesDrawer'
import { MenuItemDrawer, type ItemEditor } from './MenuItemDrawer'
import { matchesQuery } from './menuForm'
import { useAvailability } from './useAvailability'

type CategoryFilter = number | 'all'

export default function MenuPage() {
  const { can } = useMe()
  const query = useMenuManage()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<ItemEditor | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const canCreate = can(P.MENU_CREATE)
  const canCategories = can(P.MENU_MANAGE_CATEGORIES)
  const canOpen = can(P.MENU_UPDATE) || can(P.MENU_DELETE)

  const menu = query.data
  const categories = useMemo(
    () => [...(menu?.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [menu],
  )
  // A category deleted elsewhere falls back to "All".
  const activeCategory: CategoryFilter = category !== 'all' && !categories.some((c) => c.id === category) ? 'all' : category

  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const i of menu?.items ?? []) m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1)
    return m
  }, [menu])

  const rows = useMemo(() => {
    const order = new Map(categories.map((c, idx) => [c.id, idx]))
    return (menu?.items ?? [])
      .filter((i) => activeCategory === 'all' || i.category_id === activeCategory)
      .filter((i) => matchesQuery(i, search))
      .sort((a, b) => (order.get(a.category_id) ?? 0) - (order.get(b.category_id) ?? 0) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }, [menu, categories, activeCategory, search])

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? '—'
  const filterOptions: CategoryFilter[] = ['all', ...categories.map((c) => c.id)]
  const filterLabel = (v: CategoryFilter) => (v === 'all' ? `All · ${menu?.items.length ?? 0}` : `${categoryName(v)} · ${counts.get(v) ?? 0}`)

  const openNew = () => setEditor({ mode: 'new', categoryId: activeCategory === 'all' ? (categories[0]?.id ?? null) : activeCategory })

  const actions = (
    <>
      {canCategories && (
        <Button variant="secondary" icon={FolderTree} onClick={() => setCategoriesOpen(true)}>Manage categories</Button>
      )}
      {canCreate && categories.length > 0 && <Button icon={Plus} onClick={openNew}>Add item</Button>}
    </>
  )

  let body
  if (query.isPending) {
    body = <TableSkeleton rows={8} cols={4} />
  } else if (query.isError && !menu) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  } else if (menu && categories.length === 0) {
    body = (
      <EmptyState
        icon={LayoutList}
        title="Start with a category"
        message={canCategories ? 'Group dishes into categories like Starters or Drinks, then add items.' : 'A manager needs to set up menu categories first.'}
        action={canCategories ? <Button variant="secondary" icon={Plus} onClick={() => setCategoriesOpen(true)}>Add a category</Button> : undefined}
      />
    )
  } else if (menu) {
    body = (
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Categories" className="hidden lg:block">
          <div role="radiogroup" aria-label="Category" className="sticky top-20 flex flex-col gap-1">
            {filterOptions.map((o) => {
              const selected = o === activeCategory
              return (
                <button
                  key={String(o)}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(o)}
                  className={cn(
                    'flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-3.5 text-left text-[14px] font-semibold transition-colors',
                    selected ? 'bg-ink text-on-ink' : 'text-fg2 hover:bg-[var(--hover-overlay)] hover:text-fg',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o === 'all' ? 'All items' : categoryName(o)}</span>
                  <span className={cn('t-meta tabular-nums', selected ? 'opacity-75' : 'text-fg3')}>{o === 'all' ? menu.items.length : (counts.get(o) ?? 0)}</span>
                </button>
              )
            })}
          </div>
        </nav>
        <div className="min-w-0">
          <ChipRow
            className="mb-3 lg:hidden"
            ariaLabel="Category"
            options={filterOptions}
            value={activeCategory}
            onChange={setCategory}
            label={filterLabel}
            keyOf={String}
          />
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} label="Search the menu" placeholder="Dish name or description" />
            <span className="t-meta ml-auto text-fg3" aria-live="polite">
              {rows.length} {rows.length === 1 ? 'item' : 'items'}
            </span>
          </Toolbar>
          {rows.length === 0 ? (
            search.trim() ? (
              <EmptyState icon={SearchX} title="No dishes match" message="Try another name, or clear the search." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No dishes here yet"
                message={canCreate ? 'Add the first item to this menu.' : 'Items will appear once a manager adds them.'}
                action={canCreate ? <Button variant="secondary" icon={Plus} onClick={openNew}>Add item</Button> : undefined}
              />
            )
          ) : (
            <ItemsTable
              items={rows}
              categoryName={categoryName}
              showCategory={activeCategory === 'all'}
              onOpen={canOpen ? (item) => setEditor({ mode: 'edit', item }) : null}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Menu" subtitle="Items, prices, availability" actions={actions} />
      <StaleBanner error={query.isError && menu ? query.error : null} className="mb-4" />
      {body}
      <MenuItemDrawer editor={editor} categories={categories} onClose={() => setEditor(null)} />
      {canCategories && <MenuCategoriesDrawer open={categoriesOpen} onOpenChange={setCategoriesOpen} categories={categories} />}
    </div>
  )
}

function ItemsTable({ items, categoryName, showCategory, onOpen }: {
  items: MenuItem[]
  categoryName: (id: number) => string
  showCategory: boolean
  onOpen: ((item: MenuItem) => void) | null
}) {
  const { me, can } = useMe()
  const currency = me.location.currency_code
  const canToggle = can(P.MENU_SET_AVAILABILITY)
  const availability = useAvailability()

  return (
    <DataTable caption="Menu items">
      <thead>
        <tr>
          <Th>Item</Th>
          {showCategory && <Th className="hidden md:table-cell">Category</Th>}
          <Th className="text-right">Price</Th>
          <Th className="w-[170px]">Availability</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const open = onOpen ? () => onOpen(item) : null
          const name = (
            <>
              <span className={cn('t-body-strong block truncate', item.is_available ? 'text-fg' : 'text-fg2')}>{item.name}</span>
              {item.description && <span className="t-support block truncate text-fg3">{item.description}</span>}
            </>
          )
          return (
            <Tr key={item.id} {...(open ? rowProps(open) : {})}>
              <Td className="max-w-0 w-full">{open ? <RowOpen onOpen={open}>{name}</RowOpen> : name}</Td>
              {showCategory && <Td className="hidden whitespace-nowrap text-fg2 md:table-cell">{categoryName(item.category_id)}</Td>}
              <Td className="t-amount text-right whitespace-nowrap">{money(item.price, currency)}</Td>
              <Td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="cursor-default">
                {canToggle ? (
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={item.is_available}
                      disabled={availability.busy.has(item.id)}
                      onChange={(v) => availability.toggle(item, v)}
                      label={`${item.name} available`}
                    />
                    <span className={cn('t-meta', item.is_available ? 'text-success' : 'text-danger')}>
                      {item.is_available ? 'Available' : 'Sold out'}
                    </span>
                  </label>
                ) : item.is_available ? (
                  <StatusChip label="Available" tone="success" icon={CircleCheck} />
                ) : (
                  <StatusChip label="Sold out" tone="danger" icon={CircleMinus} />
                )}
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </DataTable>
  )
}
