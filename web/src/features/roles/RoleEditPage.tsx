import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Lock, ShieldAlert, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Role } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { useToast } from '@/ui/Toast'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { StatusChip } from '@/ui/Chip'
import { TextArea, TextField } from '@/ui/Field'
import { ConfirmDialog } from '@/ui/Overlay'
import { PageHeader } from '@/ui/Page'
import { ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { cleanMessage, Notice, SaveBar, useUnsavedGuard } from '@/features/staff/manage-kit'
import { rolesApi, usePermissionCatalog, useRolesLive } from './api'
import { deleteRoleCopy, diffRole, formOf, formsEqual, groupPermissions, readOnlyReason, type RoleForm } from './matrix'
import { PermissionMatrix } from './PermissionMatrix'

interface Edit {
  /** The role the edit started from (its version is what we send). null when creating. */
  base: Role | null
  form: RoleForm
}

export default function RoleEditPage() {
  const { roleId = 'new' } = useParams()
  const isNew = roleId === 'new'
  const id = isNew ? null : Number(roleId)
  const { me, grants, can } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalog = usePermissionCatalog()
  const roles = useRolesLive()
  const fresh = id === null ? null : (roles.data?.find((r) => r.id === id) ?? null)

  const [edit, setEdit] = useState<Edit | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touched, setTouched] = useState(false)

  const isDirty = (e: Edit | null): e is Edit => e !== null && !formsEqual(e.form, formOf(e.base))
  const dirty = isDirty(edit)
  // While edits are unsaved, keep the snapshot (and version) they started from, so someone
  // else's concurrent change surfaces as a conflict instead of being silently reverted.
  const base: Role | null = dirty ? edit.base : fresh
  const form: RoleForm = dirty ? edit.form : formOf(fresh)

  const change = (fn: (f: RoleForm) => RoleForm) => {
    setEdit((prev) => (isDirty(prev) ? { base: prev.base, form: fn(prev.form) } : { base: fresh, form: fn(formOf(fresh)) }))
    if (Object.keys(errors).length) setErrors({})
    setGeneral(null)
  }

  const reason = readOnlyReason(isNew, base, {
    can: (p) => can(p === 'roles.create' ? P.ROLES_CREATE : P.ROLES_UPDATE),
    has: (c) => grants.has(c),
    roleIds: me.roles.map((r) => r.id),
  })
  const editable = reason === null
  const groups = useMemo(() => groupPermissions(catalog.data ?? []), [catalog.data])
  const guard = useUnsavedGuard(dirty)

  const leave = (to: string, replace = false) => {
    flushSync(() => setEdit(null))
    navigate(to, { replace })
  }

  const toast = useToast()
  const onFailure = (e: ApiError) => {
    if (e.kind === 'validation' || e.kind === 'conflict') {
      const next: Record<string, string> = {}
      const rest: string[] = []
      for (const [field, msg] of Object.entries(e.fields)) {
        const key = field.split('.')[0] ?? field
        if (key === 'name' || key === 'description' || key === 'permissions') next[key] ??= cleanMessage(msg)
        else rest.push(cleanMessage(msg))
      }
      if (e.kind === 'conflict' && Object.keys(e.fields).length === 0) next.name = e.message
      setErrors(next)
      setGeneral(rest.length ? rest.join(' ') : Object.keys(next).length ? null : e.message)
      return
    }
    toast.error(e.message)
    // Someone else saved first: show their version rather than overwriting it.
    if (e.kind === 'stale' || e.kind === 'not-found') setEdit(null)
  }

  const create = useAction(rolesApi.create, {
    invalidate: [keys.roles],
    success: (r) => `Role ${r.name} created`,
    toastError: false,
    onSuccess: (r) => leave(`/roles/${r.id}`, true),
    onError: onFailure,
  })
  const update = useAction((vars: { id: number; body: ReturnType<typeof diffRole> }) => rolesApi.update(vars.id, vars.body), {
    invalidate: [keys.roles, ['users']],
    success: (r) => `Saved ${r.name}`,
    toastError: false,
    onSuccess: (r) => {
      queryClient.setQueryData<Role[]>(keys.roles, (list) => list?.map((x) => (x.id === r.id ? r : x)))
      setEdit(null)
    },
    onError: onFailure,
  })
  const remove = useAction((rid: number) => rolesApi.remove(rid), {
    invalidate: [keys.roles],
    success: `Role ${base?.name ?? ''} deleted`,
    onSuccess: () => {
      setConfirmDelete(false)
      leave('/roles')
    },
    onError: () => setConfirmDelete(false),
  })
  const saving = create.isPending || update.isPending

  const nameProblem = form.name.trim() ? null : 'Give the role a name'
  const save = () => {
    setTouched(true)
    if (saving || !editable || nameProblem) return
    if (isNew) {
      create.mutate({ name: form.name.trim(), description: form.description.trim() || null, permissions: [...form.permissions].sort() })
    } else if (base) {
      const body = diffRole(base, form)
      update.mutate({ id: base.id, body })
    }
  }

  const canDelete = !isNew && base !== null && can(P.ROLES_DELETE) && editable && !base.is_system
  // Wording and lock from the freshest counts (someone may have reassigned people meanwhile).
  const deleteCopy = deleteRoleCopy(fresh ?? base ?? { member_count: 0, assigned_count: 0 })
  const nameId = useId()

  const loading = catalog.isPending || (!isNew && roles.isPending)
  const loadError = catalog.error ?? (!isNew ? roles.error : null)
  const missing = !isNew && roles.data && !fresh && !dirty

  return (
    <div className="mx-auto max-w-[1100px] pb-8">
      <PageHeader
        eyebrow={<Link to="/roles" className="inline-flex items-center gap-1 hover:text-fg"><ArrowLeft aria-hidden className="size-3.5" />Roles</Link>}
        title={isNew ? 'New role' : (base?.name ?? 'Role')}
        subtitle={isNew ? 'Choose what this job can do' : base?.description || undefined}
        actions={
          <>
            {base?.is_system && <StatusChip label="Built-in" tone="info" icon={BadgeCheck} />}
            {canDelete && <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete role</Button>}
          </>
        }
      />
      {((catalog.isError && catalog.data) || (roles.isError && roles.data)) && <StaleBanner error={catalog.error ?? roles.error} className="mb-3" />}

      {loading ? (
        <div role="status" aria-label="Loading" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full max-w-md" />
          <Skeleton className="h-20 w-full" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : loadError && !catalog.data ? (
        <ErrorState error={loadError} onRetry={() => { void catalog.refetch(); void roles.refetch() }} />
      ) : loadError && !isNew && !roles.data ? (
        <ErrorState error={loadError} onRetry={() => void roles.refetch()} />
      ) : missing ? (
        <ErrorState error={new ApiError('not-found', 'This role no longer exists.')} />
      ) : (
        <div className="flex flex-col gap-5">
          {reason && <Notice icon={Lock} tone="info">{reason}</Notice>}
          {general && <Notice icon={ShieldAlert} tone="danger" live>{general}</Notice>}
          <Card className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <TextField
              id={nameId}
              label="Role name"
              value={form.name}
              maxLength={60}
              readOnly={!editable}
              className={editable ? undefined : 'bg-sunken!'}
              onBlur={() => setTouched(true)}
              onChange={(e) => change((f) => ({ ...f, name: e.target.value }))}
              error={errors.name ?? (touched && editable ? nameProblem : null)}
              autoComplete="off"
            />
            <TextArea
              label="Description (optional)"
              value={form.description}
              maxLength={200}
              rows={2}
              readOnly={!editable}
              className={editable ? undefined : 'resize-none bg-sunken!'}
              placeholder="e.g. Takes orders and serves tables"
              onChange={(e) => change((f) => ({ ...f, description: e.target.value }))}
              error={errors.description}
            />
          </Card>
          {errors.permissions && <Notice icon={ShieldAlert} tone="danger" live>{errors.permissions}</Notice>}
          <PermissionMatrix
            groups={groups}
            selected={form.permissions}
            editable={editable}
            grants={grants}
            onChange={(next) => change((f) => ({ ...f, permissions: next }))}
          />
        </div>
      )}

      <SaveBar
        dirty={dirty && editable}
        saving={saving}
        onSave={save}
        onDiscard={() => {
          setEdit(null)
          setErrors({})
          setGeneral(null)
          setTouched(false)
        }}
        canSave={!nameProblem}
        message={`${form.permissions.size} ${form.permissions.size === 1 ? 'permission' : 'permissions'}${nameProblem ? ' · name needed' : ''}`}
        saveLabel={isNew ? 'Create role' : 'Save changes'}
      />
      {guard}

      {base && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${base.name}?`}
          message={deleteCopy.message}
          confirmLabel="Delete role"
          destructive
          loading={remove.isPending}
          confirmDisabled={deleteCopy.blocked}
          onConfirm={() => remove.mutate(base.id)}
        />
      )}
    </div>
  )
}
