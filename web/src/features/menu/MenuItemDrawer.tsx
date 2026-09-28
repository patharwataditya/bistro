import { zodResolver } from '@hookform/resolvers/zod'
import { Info, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { keys } from '@/api/queries'
import type { MenuCategory, MenuItem } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { applyServerErrors, DrawerActions, Notice, useDiscardConfirm, useUnsavedGuard } from '@/features/staff/manage-kit'
import { acceptMoney } from '@/lib/money-input'
import { Button } from '@/ui/Button'
import { SelectField, TextArea, TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { useToast } from '@/ui/Toast'
import { menuApi } from './api'
import { createBody, hasChanges, itemDefaults, itemSchema, updateBody, type ItemFormValues } from './menuForm'

const FIELDS = ['categoryId', 'name', 'description', 'price', 'sortOrder'] as const
const ALIASES = { category_id: 'categoryId', sort_order: 'sortOrder' } as const

export type ItemEditor = { mode: 'new'; categoryId: number | null } | { mode: 'edit'; item: MenuItem }

/**
 * Add or edit one menu item. The item snapshot (and its version) is the one the edit started
 * from, so a concurrent change surfaces as a conflict rather than being overwritten.
 */
export function MenuItemDrawer({ editor, categories, onClose }: { editor: ItemEditor | null; categories: MenuCategory[]; onClose: () => void }) {
  const key = editor ? (editor.mode === 'edit' ? `e${editor.item.id}` : `n${editor.categoryId ?? ''}`) : 'closed'
  return editor ? <ItemDrawerBody key={key} editor={editor} categories={categories} onClose={onClose} /> : null
}

function ItemDrawerBody({ editor, categories, onClose }: { editor: ItemEditor; categories: MenuCategory[]; onClose: () => void }) {
  const { can, me } = useMe()
  const item = editor.mode === 'edit' ? editor.item : null
  const editable = item ? can(P.MENU_UPDATE) : can(P.MENU_CREATE)
  const canDelete = !!item && can(P.MENU_DELETE)
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: itemDefaults(item, editor.mode === 'new' ? editor.categoryId : null),
    mode: 'onTouched',
  })
  const { register, control, handleSubmit, setError, formState } = form

  const create = useAction((v: ItemFormValues) => menuApi.createItem(createBody(v)), {
    invalidate: [keys.menu],
    success: (r) => `${r.name} added to the menu`,
    toastError: false,
    onSuccess: onClose,
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS, { aliases: ALIASES, conflictField: 'name' })),
  })
  const update = useAction((v: ItemFormValues) => menuApi.updateItem((item as MenuItem).id, updateBody(item as MenuItem, v)), {
    invalidate: [keys.menu],
    success: (r) => `Saved ${r.name}`,
    toastError: false,
    onSuccess: onClose,
    onError: (e) => {
      if (e.kind === 'stale' || e.kind === 'not-found') {
        // Someone else changed or removed it: show what's true now instead of overwriting.
        setFormError(null)
        toast.error(e.message)
        onClose()
        return
      }
      setFormError(applyServerErrors(e, setError, FIELDS, { aliases: ALIASES, conflictField: 'name' }))
    },
  })
  const remove = useAction(() => menuApi.deleteItem((item as MenuItem).id), {
    invalidate: [keys.menu],
    success: `${item?.name ?? 'Item'} removed`,
    onSuccess: () => {
      setConfirmDelete(false)
      onClose()
    },
    onError: () => setConfirmDelete(false),
  })

  const busy = create.isPending || update.isPending || remove.isPending
  const dirty = formState.isDirty
  const discard = useDiscardConfirm(dirty && editable)
  // Browser Back / in-app links / closing the tab ask first too, like the page forms.
  const guard = useUnsavedGuard(dirty && editable)

  const submit = handleSubmit((v) => {
    setFormError(null)
    if (item) {
      if (!hasChanges(updateBody(item, v))) {
        onClose()
        return
      }
      update.mutate(v)
    } else {
      create.mutate(v)
    }
  })

  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  return (
    <>
      <Drawer
        open
        busy={busy}
        onOpenChange={(o) => !o && discard.request(onClose)}
        title={item ? item.name : 'New item'}
        description={item ? 'Price changes apply to new orders only.' : "It's available to order as soon as you add it."}
        footer={
          <DrawerActions
            leading={canDelete && editable ? (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={busy}>Remove</Button>
            ) : undefined}
            secondary={
              canDelete && !editable ? (
                <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={busy}>Remove</Button>
              ) : editable ? (
                <Button variant="secondary" onClick={() => discard.request(onClose)} disabled={busy}>Cancel</Button>
              ) : undefined
            }
            primary={
              editable ? (
                <Button type="submit" form="menu-item-form" loading={create.isPending || update.isPending} disabled={!!item && !dirty}>
                  {item ? 'Save' : 'Add item'}
                </Button>
              ) : (
                <Button variant="secondary" onClick={onClose}>Close</Button>
              )
            }
          />
        }
      >
        <form id="menu-item-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 pb-4">
          {item && !editable && canDelete && <Notice>You can remove this item, but not change its details.</Notice>}
          {item && !editable && !canDelete && <Notice>You can view this item but not change it.</Notice>}
          {formError && <Notice tone="danger" icon={Info} live>{formError}</Notice>}
          <SelectField label="Category" disabled={!editable} error={formState.errors.categoryId?.message} {...register('categoryId')}>
            {editor.mode === 'new' && !editor.categoryId && <option value="">Pick a category</option>}
            {sortedCats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </SelectField>
          <TextField label="Name" maxLength={80} autoComplete="off" disabled={!editable} error={formState.errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <TextArea
                label="Description (optional)"
                maxLength={300}
                rows={3}
                disabled={!editable}
                error={fieldState.error?.message}
                hint={`${field.value.length}/300`}
                {...field}
              />
            )}
          />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Controller
              control={control}
              name="price"
              render={({ field, fieldState }) => (
                <TextField
                  label={`Price (${me.location.currency_code})`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={!editable}
                  error={fieldState.error?.message}
                  hint={item ? 'Existing checks keep the price they were ordered at' : undefined}
                  className="tabular-nums"
                  {...field}
                  onChange={(e) => acceptMoney(e.target.value) && field.onChange(e.target.value)}
                />
              )}
            />
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
                  hint="Lower first"
                  className="tabular-nums"
                  {...field}
                  onChange={(e) => /^\d{0,5}$/.test(e.target.value) && field.onChange(e.target.value)}
                />
              )}
            />
          </div>
        </form>
      </Drawer>
      {discard.dialog}
      {guard}
      {item && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Remove ${item.name}?`}
          message="It disappears from the menu. Past orders and bills keep their own copy of it."
          confirmLabel="Remove item"
          destructive
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
        />
      )}
    </>
  )
}
