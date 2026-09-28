import { Check, CircleAlert, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { keys } from '@/api/queries'
import type { MenuCategory } from '@/api/types'
import { useAction } from '@/features/common/useAction'
import { cleanMessage, GroupLabel, Notice } from '@/features/staff/manage-kit'
import { plural } from '@/lib/format'
import { Button, IconButton } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { menuApi } from './api'

function fieldMessage(e: { fields: Record<string, string>; message: string }): string {
  const first = e.fields.name ?? Object.values(e.fields)[0]
  return first ? cleanMessage(first) : e.message
}

/** Add, rename and delete categories (menu.manage_categories). */
export function MenuCategoriesDrawer({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: MenuCategory[] }) {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<MenuCategory | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const add = useAction((name: string) => menuApi.createCategory({
    name,
    sort_order: Math.min(10_000, Math.max(-1, ...categories.map((c) => c.sort_order)) + 1),
  }), {
    invalidate: [keys.menu],
    success: (c) => `Category ${c.name} added`,
    toastError: false,
    onSuccess: () => setNewName(''),
    onError: (e) => setAddError(fieldMessage(e)),
  })
  const rename = useAction((v: { id: number; name: string }) => menuApi.updateCategory(v.id, { name: v.name }), {
    invalidate: [keys.menu],
    success: (c) => `Renamed to ${c.name}`,
    toastError: false,
    onSuccess: () => setRenaming(null),
    onError: (e) => setRenameError(fieldMessage(e)),
  })
  const remove = useAction((c: MenuCategory) => menuApi.deleteCategory(c.id), {
    invalidate: [keys.menu],
    success: () => (deleting ? `Category ${deleting.name} removed` : null),
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
    if (!name) {
      setAddError('Name the category')
      return
    }
    setAddError(null)
    setRefusal(null)
    add.mutate(name)
  }

  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    if (!renaming) return
    const name = renaming.name.trim()
    if (!name) {
      setRenameError('Name the category')
      return
    }
    const current = categories.find((c) => c.id === renaming.id)
    if (current && current.name === name) {
      setRenaming(null)
      return
    }
    setRenameError(null)
    rename.mutate({ id: renaming.id, name })
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        busy={busy}
        title="Categories"
        description="How the menu is grouped for staff"
        width={440}
      >
        <form onSubmit={submitAdd} className="flex items-start gap-2 pt-1" noValidate>
          <TextField
            label="New category"
            placeholder="e.g. Starters"
            maxLength={60}
            value={newName}
            error={addError}
            onChange={(e) => {
              setNewName(e.target.value)
              setAddError(null)
            }}
            wrapperClassName="flex-1"
          />
          <Button type="submit" variant="secondary" icon={Plus} loading={add.isPending} className="mt-[22px] h-12">Add</Button>
        </form>

        {refusal && (
          <Notice tone="danger" icon={CircleAlert} live className="mt-4">
            <div className="flex items-start gap-2">
              <span className="flex-1">{refusal}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setRefusal(null)} className="-my-1 inline-flex size-7 items-center justify-center rounded-full hover:bg-[var(--hover-overlay)]">
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </Notice>
        )}

        <GroupLabel>{plural(sorted.length, 'category', 'categories')}</GroupLabel>
        {sorted.length === 0 ? (
          <p className="t-support text-fg2">No categories yet. Add one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-md)] border border-line">
            {sorted.map((c) =>
              renaming?.id === c.id ? (
                <li key={c.id} className="px-3 py-2.5">
                  <form onSubmit={submitRename} noValidate className="flex items-start gap-1">
                    <TextField
                      label={`Rename ${c.name}`}
                      hideLabel
                      autoFocus
                      maxLength={60}
                      value={renaming.name}
                      error={renameError}
                      onChange={(e) => {
                        setRenaming({ id: c.id, name: e.target.value })
                        setRenameError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
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
                <li key={c.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-4">
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate text-fg">{c.name}</div>
                    <div className="t-meta text-fg3">{plural(c.item_count, 'item')}</div>
                  </div>
                  <IconButton icon={Pencil} label={`Rename ${c.name}`} disabled={busy} onClick={() => {
                    setRenameError(null)
                    setRenaming({ id: c.id, name: c.name })
                  }} />
                  <IconButton icon={Trash2} tone="danger" label={`Delete ${c.name}`} disabled={busy} onClick={() => {
                    setRefusal(null)
                    setDeleting(c)
                  }} />
                </li>
              ),
            )}
          </ul>
        )}
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        message={
          deleting && deleting.item_count > 0
            ? `${deleting.item_count} ${deleting.item_count === 1 ? 'item is' : 'items are'} still in this category. Move or remove them first, or the delete will be refused.`
            : 'The category is removed from the menu.'
        }
        confirmLabel="Delete category"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  )
}
