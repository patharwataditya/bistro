import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, ReceiptText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { keys } from '@/api/queries'
import type { Area, DiningTable } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { applyServerErrors, DrawerActions, Notice, useDiscardConfirm } from '@/features/staff/manage-kit'
import { Button } from '@/ui/Button'
import { Stepper } from '@/ui/Controls'
import { SelectField, TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { useToast } from '@/ui/Toast'
import { createTableBody, tableBodyChanged, tableDefaults, tablesApi, updateTableBody, type TableFormValues } from './TablesManageApi'

export const tableSchema = z.object({
  name: z.string().trim().min(1, 'Name the table').max(20, 'At most 20 characters'),
  capacity: z.number().int().min(1, 'At least 1 seat').max(50, 'At most 50 seats'),
  areaId: z.string(),
  sortOrder: z.string().trim().regex(/^\d{1,5}$/, 'A whole number from 0 to 10000').refine((v) => Number(v) <= 10_000, 'A whole number from 0 to 10000'),
})

const FIELDS = ['name', 'capacity', 'areaId', 'sortOrder'] as const
const ALIASES = { area_id: 'areaId', sort_order: 'sortOrder', clear_area: 'areaId' } as const

export type TableEditor = { mode: 'new'; areaId: number | null } | { mode: 'edit'; table: DiningTable }

export function TablesManageDrawer({ editor, areas, onClose }: { editor: TableEditor | null; areas: Area[]; onClose: () => void }) {
  if (!editor) return null
  const key = editor.mode === 'edit' ? `e${editor.table.id}` : `n${editor.areaId ?? ''}`
  return <Body key={key} editor={editor} areas={areas} onClose={onClose} />
}

function Body({ editor, areas, onClose }: { editor: TableEditor; areas: Area[]; onClose: () => void }) {
  const { can } = useMe()
  const toast = useToast()
  const table = editor.mode === 'edit' ? editor.table : null
  const editable = table ? can(P.TABLES_UPDATE) : can(P.TABLES_CREATE)
  const canDelete = !!table && can(P.TABLES_DELETE)
  const hasOrder = !!table?.active_order
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<TableFormValues>({
    resolver: zodResolver(tableSchema),
    defaultValues: tableDefaults(table, editor.mode === 'new' ? editor.areaId : null),
    mode: 'onTouched',
  })
  const { register, control, handleSubmit, setError, formState } = form

  const onFail = (e: Parameters<typeof applyServerErrors>[0]) =>
    setFormError(applyServerErrors<TableFormValues>(e, setError, FIELDS, { aliases: ALIASES, conflictField: 'name' }))

  const create = useAction((v: TableFormValues) => tablesApi.createTable(createTableBody(v)), {
    invalidate: [keys.floor],
    success: (t) => `Table ${t.name} added`,
    toastError: false,
    onSuccess: onClose,
    onError: onFail,
  })
  const update = useAction((v: TableFormValues) => tablesApi.updateTable((table as DiningTable).id, updateTableBody(table as DiningTable, v)), {
    invalidate: [keys.floor],
    success: (t) => `Saved table ${t.name}`,
    toastError: false,
    onSuccess: onClose,
    onError: (e) => {
      if (e.kind === 'stale' || e.kind === 'not-found') {
        toast.error(e.message)
        onClose()
        return
      }
      onFail(e)
    },
  })
  const remove = useAction(() => tablesApi.deleteTable((table as DiningTable).id), {
    invalidate: [keys.floor],
    success: `Table ${table?.name ?? ''} removed`,
    onSuccess: () => {
      setConfirmDelete(false)
      onClose()
    },
    onError: () => setConfirmDelete(false),
  })

  const busy = create.isPending || update.isPending || remove.isPending
  const discard = useDiscardConfirm(formState.isDirty && editable)
  const sortedAreas = [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const submit = handleSubmit((v) => {
    setFormError(null)
    if (table) {
      if (!tableBodyChanged(updateTableBody(table, v))) return onClose()
      update.mutate(v)
    } else {
      create.mutate(v)
    }
  })

  return (
    <>
      <Drawer
        open
        busy={busy}
        onOpenChange={(o) => !o && discard.request(onClose)}
        title={table ? `Table ${table.name}` : 'New table'}
        description={table ? `${table.capacity} seats · ${table.area_name ?? 'No area'}` : 'Name it the way staff say it, e.g. 12 or T4.'}
        footer={
          <DrawerActions
            secondary={
              canDelete ? (
                <Button variant="danger" icon={Trash2} disabled={busy || hasOrder} aria-describedby={hasOrder ? 'table-order-note' : undefined} onClick={() => setConfirmDelete(true)}>
                  Remove
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => discard.request(onClose)}>Cancel</Button>
              )
            }
            primary={
              editable ? (
                <Button type="submit" form="table-form" loading={create.isPending || update.isPending} disabled={!!table && !formState.isDirty}>
                  {table ? 'Save' : 'Add table'}
                </Button>
              ) : (
                <Button variant="secondary" onClick={onClose}>Close</Button>
              )
            }
          />
        }
      >
        <form id="table-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 pb-4">
          {hasOrder && canDelete && (
            <div id="table-order-note">
              <Notice icon={ReceiptText}>This table has an open order, so it can't be removed. Close or move the order first.</Notice>
            </div>
          )}
          {table && !editable && canDelete && <Notice>You can remove tables but not change them.</Notice>}
          {formError && <Notice tone="danger" icon={CircleAlert} live>{formError}</Notice>}
          <TextField label="Table name" maxLength={20} autoComplete="off" disabled={!editable} error={formState.errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="capacity"
            render={({ field, fieldState }) => (
              <div>
                <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-line-strong px-3.5 py-1.5">
                  <span className="t-body-strong flex-1 text-fg">Seats</span>
                  {editable ? (
                    <Stepper value={field.value} onChange={(v) => field.onChange(v)} min={1} max={50} label="Seats" compact />
                  ) : (
                    <span className="t-amount text-fg">{field.value}</span>
                  )}
                </div>
                {fieldState.error && <p role="alert" className="t-meta mt-1.5 text-danger">{fieldState.error.message}</p>}
              </div>
            )}
          />
          <SelectField
            label="Area"
            disabled={!editable}
            error={formState.errors.areaId?.message}
            hint={sortedAreas.length === 0 ? 'Add areas on this page to group tables.' : undefined}
            {...register('areaId')}
          >
            <option value="">No area</option>
            {sortedAreas.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </SelectField>
          <Controller
            control={control}
            name="sortOrder"
            render={({ field, fieldState }) => (
              <TextField
                label="Position"
                inputMode="numeric"
                autoComplete="off"
                disabled={!editable}
                error={fieldState.error?.message}
                hint="Lower first on the floor"
                wrapperClassName="max-w-[160px]"
                className="tabular-nums"
                {...field}
                onChange={(e) => /^\d{0,5}$/.test(e.target.value) && field.onChange(e.target.value)}
              />
            )}
          />
        </form>
      </Drawer>
      {discard.dialog}
      {table && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Remove table ${table.name}?`}
          message="It disappears from the floor. Past orders keep their table name."
          confirmLabel="Remove table"
          destructive
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
        />
      )}
    </>
  )
}
