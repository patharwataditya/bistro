import { Armchair, Check, CircleAlert, EyeOff, LayoutGrid, Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import { Fragment, useState, type FormEvent } from 'react'
import { useFloor, keys } from '@/api/queries'
import type { Area, DiningTable } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { cleanMessage, Notice, RowOpen, rowProps, TableSkeleton } from '@/features/staff/manage-kit'
import { plural } from '@/lib/format'
import { Button, IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { StatusChip } from '@/ui/Chip'
import { TextField } from '@/ui/Field'
import { ConfirmDialog } from '@/ui/Overlay'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, StaleBanner } from '@/ui/States'
import { tableVisual } from '@/ui/status'
import { DataTable, Td, Th, Tr } from '@/ui/Table'
import { groupByArea, tablesApi } from './TablesManageApi'
import { TablesManageDrawer, type TableEditor } from './TablesManageDrawer'

export default function TablesManagePage() {
  const { can } = useMe()
  // Managing tables still means reading the floor (GET /tables needs tables.view). A role with
  // only create/update/delete gets an explanation instead of a raw "not allowed" error.
  if (!can(P.TABLES_VIEW)) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader title="Tables & areas" subtitle="Floor layout" />
        <Card>
          <EmptyState
            icon={EyeOff}
            title="You can't see the tables"
            message="Your role can change tables, but not view them, so there's nothing to show here. Ask a manager to add “Tables – View” to your role."
          />
        </Card>
      </div>
    )
  }
  return <TablesManage />
}

function TablesManage() {
  const { can } = useMe()
  const floor = useFloor(30_000)
  const [editor, setEditor] = useState<TableEditor | null>(null)
  const canCreate = can(P.TABLES_CREATE)
  const canOpen = can(P.TABLES_UPDATE) || can(P.TABLES_DELETE)
  const data = floor.data

  let body
  if (floor.isPending) {
    body = <TableSkeleton rows={8} cols={4} />
  } else if (floor.isError && !data) {
    body = <ErrorState error={floor.error} onRetry={() => void floor.refetch()} />
  } else if (data) {
    const groups = groupByArea(data.areas, data.tables)
    body = (
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {data.tables.length === 0 ? (
            <Card>
              <EmptyState
                icon={LayoutGrid}
                title="No tables yet"
                message={canCreate ? 'Add each table with its seats so staff can seat guests.' : 'A manager needs to add the tables.'}
                action={canCreate ? <Button variant="secondary" icon={Plus} onClick={() => setEditor({ mode: 'new', areaId: null })}>Add table</Button> : undefined}
              />
            </Card>
          ) : (
            <DataTable caption="Tables by area">
              <thead>
                <tr>
                  <Th>Table</Th>
                  <Th className="text-right">Seats</Th>
                  <Th className="hidden md:table-cell">Area</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {groups.filter((g) => g.tables.length > 0).map((g) => (
                  <Fragment key={g.area?.id ?? 'none'}>
                    <tr>
                      <th scope="colgroup" colSpan={4} className="t-status border-b border-line bg-sunken/70 px-4 py-2 text-left text-fg2">
                        {g.area?.name ?? 'No area'} · {g.tables.length}
                      </th>
                    </tr>
                    {g.tables.map((t) => (
                      <TableRow key={t.id} table={t} onOpen={canOpen ? () => setEditor({ mode: 'edit', table: t }) : null} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
        <div className="order-first xl:order-none">
          <AreasCard areas={data.areas} tables={data.tables} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Tables & areas"
        subtitle="Floor layout"
        actions={canCreate && data && data.tables.length > 0 ? <Button icon={Plus} onClick={() => setEditor({ mode: 'new', areaId: null })}>Add table</Button> : undefined}
      />
      <StaleBanner error={floor.isError && data ? floor.error : null} className="mb-4" />
      {body}
      <TablesManageDrawer editor={editor} areas={data?.areas ?? []} onClose={() => setEditor(null)} />
    </div>
  )
}

function TableRow({ table, onOpen }: { table: DiningTable; onOpen: (() => void) | null }) {
  const v = tableVisual(table.status)
  return (
    <Tr {...(onOpen ? rowProps(onOpen) : {})}>
      <Td className="w-full">
        {onOpen ? (
          <RowOpen onOpen={onOpen}>
            <span className="t-card-title text-fg"><span className="sr-only">Table </span>{table.name}</span>
          </RowOpen>
        ) : (
          <span className="t-card-title text-fg">{table.name}</span>
        )}
      </Td>
      <Td className="text-right whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 tabular-nums text-fg2">
          <Armchair aria-hidden className="size-4 text-fg3" />
          <span className="sr-only">Seats:</span>
          {table.capacity}
        </span>
      </Td>
      <Td className="hidden whitespace-nowrap text-fg2 md:table-cell">{table.area_name ?? '—'}</Td>
      <Td className="whitespace-nowrap">
        <div className="flex items-center gap-2">
          <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
          {table.active_order && <StatusChip label="Open order" tone="accent" icon={ReceiptText} />}
        </div>
      </Td>
    </Tr>
  )
}

function errMessage(e: { fields: Record<string, string>; message: string }): string {
  const f = e.fields.name ?? Object.values(e.fields)[0]
  return f ? cleanMessage(f) : e.message
}

/** Areas are sections of the room. Add (tables.create), rename (tables.update), delete (tables.delete). */
function AreasCard({ areas, tables }: { areas: Area[]; tables: DiningTable[] }) {
  const { can } = useMe()
  const canCreate = can(P.TABLES_CREATE)
  const canRename = can(P.TABLES_UPDATE)
  const canDelete = can(P.TABLES_DELETE)
  const sorted = [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const count = (id: number) => tables.filter((t) => t.area_id === id).length

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Area | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const add = useAction((name: string) => tablesApi.createArea({ name, sort_order: Math.min(10_000, Math.max(-1, ...areas.map((a) => a.sort_order)) + 1) }), {
    invalidate: [keys.floor],
    success: (a) => `Area ${a.name} added`,
    toastError: false,
    onSuccess: () => {
      setNewName('')
      setAdding(false)
    },
    onError: (e) => setAddError(errMessage(e)),
  })
  const rename = useAction((v: { id: number; name: string }) => tablesApi.updateArea(v.id, { name: v.name }), {
    invalidate: [keys.floor],
    success: (a) => `Renamed to ${a.name}`,
    toastError: false,
    onSuccess: () => setRenaming(null),
    onError: (e) => setRenameError(errMessage(e)),
  })
  const remove = useAction((a: Area) => tablesApi.deleteArea(a.id), {
    invalidate: [keys.floor],
    success: () => (deleting ? `Area ${deleting.name} removed` : null),
    toastError: false,
    onSuccess: () => setDeleting(null),
    onError: (e) => {
      setDeleting(null)
      setRefusal(e.message)
    },
  })
  const busy = add.isPending || rename.isPending || remove.isPending

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return setAddError('Name the area')
    setRefusal(null)
    add.mutate(name)
  }
  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    if (!renaming) return
    const name = renaming.name.trim()
    if (!name) return setRenameError('Name the area')
    if (areas.find((a) => a.id === renaming.id)?.name === name) return setRenaming(null)
    rename.mutate({ id: renaming.id, name })
  }

  const deleteCount = deleting ? count(deleting.id) : 0

  return (
    <Card className="p-0">
      <section aria-labelledby="areas-title">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="areas-title" className="t-section text-fg">Areas</h2>
            <p className="t-support text-fg2">Sections of the room, like Terrace or Bar</p>
          </div>
          {canCreate && !adding && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => {
              setAddError(null)
              setAdding(true)
            }}>Add</Button>
          )}
        </div>
        {adding && (
          <form onSubmit={submitAdd} noValidate className="flex items-start gap-1 px-5 pb-3">
            <TextField
              label="Area name"
              hideLabel
              placeholder="Area name"
              autoFocus
              maxLength={60}
              value={newName}
              error={addError}
              onChange={(e) => {
                setNewName(e.target.value)
                setAddError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setAdding(false)
                }
              }}
              wrapperClassName="flex-1"
              className="h-11"
            />
            <IconButton icon={X} label="Cancel" onClick={() => setAdding(false)} disabled={add.isPending} className="mt-0.5" />
            <IconButton icon={Check} label="Add area" type="submit" disabled={add.isPending} className="mt-0.5" />
          </form>
        )}
        {refusal && (
          <div className="px-5 pb-3">
            <Notice tone="danger" icon={CircleAlert} live>
              <div className="flex items-start gap-2">
                <span className="flex-1">{refusal}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setRefusal(null)} className="-my-1 inline-flex size-7 items-center justify-center rounded-full hover:bg-[var(--hover-overlay)]">
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            </Notice>
          </div>
        )}
        {sorted.length === 0 ? (
          <p className="t-support border-t border-line px-5 py-4 text-fg2">No areas. Tables work fine without one.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((a) =>
              renaming?.id === a.id ? (
                <li key={a.id} className="px-4 py-2">
                  <form onSubmit={submitRename} noValidate className="flex items-start gap-1">
                    <TextField
                      label={`Rename ${a.name}`}
                      hideLabel
                      autoFocus
                      maxLength={60}
                      value={renaming.name}
                      error={renameError}
                      onChange={(e) => {
                        setRenaming({ id: a.id, name: e.target.value })
                        setRenameError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setRenaming(null)
                        }
                      }}
                      wrapperClassName="flex-1"
                      className="h-11"
                    />
                    <IconButton icon={X} label="Cancel rename" onClick={() => setRenaming(null)} disabled={rename.isPending} className="mt-0.5" />
                    <IconButton icon={Check} label="Save name" type="submit" disabled={rename.isPending} className="mt-0.5" />
                  </form>
                </li>
              ) : (
                <li key={a.id} className="flex min-h-14 items-center gap-1 py-1.5 pr-2 pl-5">
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate text-fg">{a.name}</div>
                    <div className="t-meta text-fg3">{plural(count(a.id), 'table')}</div>
                  </div>
                  {canRename && (
                    <IconButton icon={Pencil} label={`Rename ${a.name}`} disabled={busy} onClick={() => {
                      setRenameError(null)
                      setRenaming({ id: a.id, name: a.name })
                    }} />
                  )}
                  {canDelete && (
                    <IconButton icon={Trash2} tone="danger" label={`Delete area ${a.name}`} disabled={busy} onClick={() => {
                      setRefusal(null)
                      setDeleting(a)
                    }} />
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'area'}?`}
        message={
          deleteCount > 0
            ? `${deleteCount} ${deleteCount === 1 ? 'table is' : 'tables are'} still in this area. Move or remove them first, or the delete will be refused.`
            : 'The area is removed. No tables use it.'
        }
        confirmLabel="Delete area"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  )
}
