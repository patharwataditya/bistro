import { CheckCircle2, ChevronLeft, ChevronRight, SearchX, UserPlus, Users, UserX } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { StaffMember } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { relative } from '@/lib/format'
import { useServerNow } from '@/lib/live'
import { Button, IconButton } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { Switch } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, StaleBanner } from '@/ui/States'
import { DataTable, Td, Th } from '@/ui/Table'
import { AddStaffDrawer } from './AddStaffDrawer'
import { PAGE_SIZE, useRoleList, useStaffPage } from './api'
import { Avatar, RowOpen, rowProps, SearchInput, TableSkeleton, Toolbar } from './manage-kit'
import { clampOffset } from './paging'
import { rolesFromMembers, type RoleOption } from './roleAssign'
import { StaffDetailDrawer } from './StaffDetailDrawer'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

export default function StaffPage() {
  const { me, can } = useMe()
  const [search, setSearch] = useState('')
  const [inactive, setInactive] = useState(false)
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const q = useDeferredValue(useDebounced(search.trim().slice(0, 60), 300))
  const now = useServerNow(undefined, 60_000)

  const users = useStaffPage(inactive, q, offset)
  const canReadRoles = can(P.ROLES_VIEW)
  const roleList = useRoleList(canReadRoles)

  const roleOptions = useMemo<(RoleOption & { description?: string | null })[]>(() => {
    if (canReadRoles && roleList.data) {
      return [...roleList.data]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, description: r.description }))
    }
    return rolesFromMembers(users.data?.items ?? [])
  }, [canReadRoles, roleList.data, users.data])
  // Without the role list (no roles.view, or it failed to load) the options above are only
  // the roles seen on this page of staff, so the pickers say so instead of implying "all".
  const rolesComplete = canReadRoles && !!roleList.data

  // The open drawer follows refreshed data by id, so it always shows the latest version.
  const current = selected ? (users.data?.items.find((m) => m.id === selected.id) ?? selected) : null
  const fresher = current && selected && current.version < selected.version ? selected : current

  const page = users.data
  const total = page?.total ?? 0
  const searching = q.length > 0
  // The last row of the last page went away (deactivated, or filtered out): step back a page.
  const clamped = page && !users.isPlaceholderData ? clampOffset(offset, total, PAGE_SIZE) : null
  if (clamped !== null && clamped !== offset) setOffset(clamped)

  const changeFilter = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Staff"
        subtitle="Accounts and access"
        actions={can(P.STAFF_CREATE) && <Button icon={UserPlus} onClick={() => setAdding(true)}>Add staff</Button>}
      />
      <Toolbar>
        <SearchInput value={search} onChange={(v) => changeFilter(() => setSearch(v))} placeholder="Name or username" label="Search staff" />
        <label className="flex h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2">
          <Switch checked={inactive} onChange={(v) => changeFilter(() => setInactive(v))} label="Show deactivated" />
          <span className="t-body text-fg">Show deactivated</span>
        </label>
      </Toolbar>

      {users.isError && users.data && <StaleBanner error={users.error} className="mb-3" />}

      {users.isPending ? (
        <TableSkeleton rows={8} cols={5} />
      ) : users.isError && !users.data ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : page && page.items.length === 0 && offset === 0 ? (
        <EmptyState
          icon={searching ? SearchX : Users}
          title={searching ? `No one matches "${q}"` : 'No staff yet'}
          message={searching
            ? 'Check the spelling, or search by username.'
            : can(P.STAFF_CREATE)
              ? 'Add your team so everyone signs in with their own account.'
              : 'Staff accounts will appear here once a manager adds them.'}
          action={!searching && can(P.STAFF_CREATE) ? <Button variant="secondary" icon={UserPlus} onClick={() => setAdding(true)}>Add staff</Button> : undefined}
        />
      ) : page ? (
        <>
          <DataTable caption={`Staff, ${total} ${total === 1 ? 'person' : 'people'}`} className={users.isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Username</Th>
                <Th>Roles</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((m) => (
                <tr key={m.id} {...rowProps(() => setSelected(m))}>
                  <Td>
                    <RowOpen onOpen={() => setSelected(m)}>
                      <span className="flex items-center gap-3">
                        <Avatar name={m.full_name} muted={!m.is_active} />
                        <span className={m.is_active ? 't-body-strong text-fg' : 't-body-strong text-fg2'}>{m.full_name}</span>
                        {m.id === me.id && <span className="t-status rounded-full bg-accent-soft px-2 py-0.5 text-accent">You</span>}
                      </span>
                    </RowOpen>
                  </Td>
                  <Td className="t-support text-fg2">@{m.username}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1.5" aria-label={`Roles: ${m.roles.map((r) => r.name).join(', ') || 'none'}`}>
                      {m.roles.length === 0
                        ? <span className="t-support text-fg3">No roles</span>
                        : m.roles.map((r) => <span key={r.id} className="t-meta rounded-full bg-sunken px-2.5 py-1 font-semibold whitespace-nowrap text-fg2">{r.name}</span>)}
                    </span>
                  </Td>
                  <Td className="t-support whitespace-nowrap text-fg2">{m.last_login_at ? relative(m.last_login_at, now, me.location.timezone) : 'Never'}</Td>
                  <Td className="text-right">
                    {m.is_active
                      ? <StatusChip label="Active" tone="success" icon={CheckCircle2} />
                      : <StatusChip label="Inactive" tone="neutral" icon={UserX} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {(total > PAGE_SIZE || offset > 0) && (
            <nav aria-label="Pages" className="mt-3 flex items-center justify-end gap-2">
              <span className="t-meta mr-2 text-fg2" aria-live="polite">
                {total === 0 ? 'None' : `${Math.min(offset + 1, total)}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
              </span>
              <IconButton icon={ChevronLeft} label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} />
              <IconButton icon={ChevronRight} label="Next page" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} />
            </nav>
          )}
        </>
      ) : null}

      <AddStaffDrawer open={adding} onClose={() => setAdding(false)} roles={roleOptions} rolesComplete={rolesComplete} />
      <StaffDetailDrawer member={fresher} onClose={() => setSelected(null)} onChanged={setSelected} roles={roleOptions} rolesComplete={rolesComplete} />
    </div>
  )
}
