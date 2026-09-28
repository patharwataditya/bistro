import { Ban, CheckCircle2, KeyRound, Lock, UserX } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/errors'
import type { StaffMember } from '@/api/types'
import { P, type Permission } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { dateTime } from '@/lib/format'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { staffApi } from './api'
import { Avatar, cleanMessage, DetailLine, GroupLabel, LockNote, Notice, PASSWORD_HINT, passwordProblem, useDiscardConfirm } from './manage-kit'
import { RolePicker } from './RolePicker'
import type { RoleOption } from './roleAssign'

const INVALIDATE = [['users'], ['roles']]

export function lockReason(member: StaffMember, isMe: boolean): string | null {
  if (isMe) return "You can't change your own access. Ask another manager."
  if (!member.manageable) return "This person has access you don't have, so you can't manage them."
  return null
}

export function StaffDetailDrawer({ member, onClose, onChanged, roles }: {
  member: StaffMember | null
  onClose: () => void
  /** The server's latest copy after an action, so the drawer never shows an old version. */
  onChanged: (m: StaffMember) => void
  roles: readonly (RoleOption & { description?: string | null })[]
}) {
  const { me, can } = useMe()
  const [rolesDirty, setRolesDirty] = useState(false)
  const [pwDirty, setPwDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const discard = useDiscardConfirm(rolesDirty || pwDirty)
  const close = () => discard.request(() => {
    setRolesDirty(false)
    setPwDirty(false)
    onClose()
  })
  return (
    <>
      <Drawer
        open={member !== null}
        onOpenChange={(o) => !o && close()}
        title={member?.full_name ?? 'Staff'}
        description={member ? `@${member.username}` : undefined}
        busy={busy}
      >
        {member && (
          <StaffDetail
            // A new server version resets local edits: they would be stale anyway.
            key={`${member.id}-${member.version}`}
            member={member}
            roles={roles}
            isMe={member.id === me.id}
            can={can}
            zone={me.location.timezone}
            onChanged={(m) => {
              setRolesDirty(false)
              setPwDirty(false)
              onChanged(m)
            }}
            onDirty={(r, p) => {
              setRolesDirty(r)
              setPwDirty(p)
            }}
            onBusy={setBusy}
          />
        )}
      </Drawer>
      {discard.dialog}
    </>
  )
}

function StaffDetail({ member, roles, isMe, can, zone, onChanged, onDirty, onBusy }: {
  member: StaffMember
  roles: readonly (RoleOption & { description?: string | null })[]
  isMe: boolean
  can: (p: Permission) => boolean
  zone: string
  onChanged: (m: StaffMember) => void
  onDirty: (roles: boolean, password: boolean) => void
  onBusy: (b: boolean) => void
}) {
  const original = member.roles.map((r) => r.id)
  const [selected, setSelected] = useState<number[]>(original)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [confirmActive, setConfirmActive] = useState(false)
  const rolesLabel = useId()
  const firstName = member.full_name.split(/\s+/)[0] ?? member.full_name

  const reason = lockReason(member, isMe)
  const canRoles = can(P.STAFF_UPDATE) && member.manageable && !isMe
  const canPassword = can(P.STAFF_UPDATE) && member.password_resettable && !isMe
  const canActive = can(P.STAFF_DEACTIVATE) && member.manageable && !isMe
  const showsManagement = can(P.STAFF_UPDATE) || can(P.STAFF_DEACTIVATE)

  const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x))
  const rolesDirty = !same(selected, original)

  const setRoles = (ids: number[]) => {
    setSelected(ids)
    onDirty(!same(ids, original), password.length > 0)
  }
  const setPw = (v: string) => {
    setPassword(v)
    setPwError(null)
    onDirty(rolesDirty, v.length > 0)
  }

  const saveRoles = useAction((ids: number[]) => staffApi.update(member.id, { version: member.version, role_ids: ids }), {
    invalidate: INVALIDATE,
    success: `Updated access for ${member.full_name}`,
    onSuccess: onChanged,
  })
  const reset = useAction((pw: string) => staffApi.resetPassword(member.id, member.version, pw), {
    invalidate: INVALIDATE,
    success: `Password reset. ${member.full_name} is signed out everywhere.`,
    toastError: false,
    onSuccess: onChanged,
    onError: (e: ApiError) => setPwError(cleanMessage(e.fields.new_password ?? e.message)),
  })
  const toggleActive = useAction((active: boolean) => staffApi.setActive(member.id, member.version, active), {
    invalidate: INVALIDATE,
    success: (m) => (m.is_active ? `${m.full_name} is active again` : `${m.full_name} can no longer sign in`),
    onSuccess: (m) => {
      setConfirmActive(false)
      onChanged(m)
    },
    onError: () => setConfirmActive(false),
  })
  const pending = saveRoles.isPending || reset.isPending || toggleActive.isPending
  // Lock the drawer while a request is in flight.
  useEffect(() => {
    onBusy(pending)
  }, [pending, onBusy])

  const pwProblem = password ? passwordProblem(password) : null
  const roleOptions = roles.length > 0 ? roles : member.roles.map((r) => ({ id: r.id, name: r.name, permissions: null }))

  return (
    <div className="flex flex-col pb-6">
      <div className="flex items-center gap-3 py-2">
        <Avatar name={member.full_name} muted={!member.is_active} size={48} />
        <div className="flex flex-wrap items-center gap-2">
          {member.is_active
            ? <StatusChip label="Active" tone="success" icon={CheckCircle2} />
            : <StatusChip label="Inactive" tone="neutral" icon={UserX} />}
          {isMe && <StatusChip label="You" tone="accent" />}
        </div>
      </div>
      <dl className="mt-2">
        <DetailLine label="Username">@{member.username}</DetailLine>
        <DetailLine label="Last sign-in">{member.last_login_at ? dateTime(member.last_login_at, zone) : 'Never'}</DetailLine>
        <DetailLine label="Added">{dateTime(member.created_at, zone)}</DetailLine>
      </dl>

      {showsManagement && reason && <Notice className="mt-4" icon={Lock}>{reason}</Notice>}

      <GroupLabel id={rolesLabel}>Roles</GroupLabel>
      {canRoles ? (
        <>
          <RolePicker options={roleOptions} value={selected} onChange={setRoles} disabled={saveRoles.isPending} labelledBy={rolesLabel} />
          {selected.length === 0 && <p className="t-meta mt-1.5 text-fg3">Everyone needs at least one role.</p>}
          {rolesDirty && (
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRoles(original)} disabled={saveRoles.isPending}>Undo</Button>
              <Button
                variant="primary"
                size="sm"
                loading={saveRoles.isPending}
                disabled={selected.length === 0}
                onClick={() => saveRoles.mutate(selected)}
              >
                Save roles
              </Button>
            </div>
          )}
        </>
      ) : member.roles.length === 0 ? (
        <p className="t-support text-fg2">No roles</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {member.roles.map((r) => <span key={r.id} className="t-meta rounded-full bg-sunken px-2.5 py-1 font-semibold text-fg2">{r.name}</span>)}
        </div>
      )}

      {can(P.STAFF_UPDATE) && (isMe || member.manageable) && (
        <>
          <GroupLabel>Password</GroupLabel>
          {isMe ? (
            <LockNote>To change your own password, use your <Link to="/account" className="underline underline-offset-2 hover:text-fg">account settings</Link>.</LockNote>
          ) : !canPassword ? (
            <LockNote>Only someone with more access than {firstName} can reset this password.</LockNote>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (reset.isPending) return
                const problem = passwordProblem(password)
                if (problem) setPwError(problem)
                else reset.mutate(password)
              }}
            >
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPw(e.target.value)}
                error={pwError}
                hint={password ? (pwProblem ?? 'Looks good') : PASSWORD_HINT}
              />
              <p className="t-meta text-fg3">They'll be signed out everywhere and use the new password next time.</p>
              <Button type="submit" variant="secondary" icon={KeyRound} loading={reset.isPending} disabled={!password} className="self-start">
                Reset password
              </Button>
            </form>
          )}
        </>
      )}

      {canActive && (
        <>
          <GroupLabel>Account</GroupLabel>
          {member.is_active ? (
            <div className="flex flex-col items-start gap-2">
              <Button variant="danger" icon={Ban} onClick={() => setConfirmActive(true)}>Deactivate</Button>
              <p className="t-meta text-fg3">Stops them signing in. Nothing they did is deleted.</p>
            </div>
          ) : (
            <Button variant="secondary" icon={CheckCircle2} onClick={() => setConfirmActive(true)} className="self-start">Reactivate</Button>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmActive}
        onOpenChange={setConfirmActive}
        title={member.is_active ? `Deactivate ${member.full_name}?` : `Reactivate ${member.full_name}?`}
        message={member.is_active
          ? "They're signed out on every device and can't sign in until reactivated. Their history stays."
          : 'They can sign in again with their existing password and roles.'}
        confirmLabel={member.is_active ? 'Deactivate' : 'Reactivate'}
        destructive={member.is_active}
        loading={toggleActive.isPending}
        onConfirm={() => toggleActive.mutate(!member.is_active)}
      />
    </div>
  )
}
