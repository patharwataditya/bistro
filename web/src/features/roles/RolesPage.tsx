import { BadgeCheck, Lock, Plus, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, StaleBanner } from '@/ui/States'
import { DataTable, Td, Th } from '@/ui/Table'
import { rowProps, TableSkeleton } from '@/features/staff/manage-kit'
import { usePermissionCatalog, useRolesLive } from './api'

export default function RolesPage() {
  const { can } = useMe()
  const navigate = useNavigate()
  const roles = useRolesLive()
  const catalog = usePermissionCatalog()
  const total = catalog.data?.length ?? null
  const canCreate = can(P.ROLES_CREATE)
  const sorted = roles.data ? [...roles.data].sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name)) : []

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Roles & permissions"
        subtitle="What each job can see and do"
        actions={canCreate && <Button icon={Plus} onClick={() => navigate('/roles/new')}>New role</Button>}
      />
      {roles.isError && roles.data && <StaleBanner error={roles.error} className="mb-3" />}
      {roles.isPending ? (
        <TableSkeleton rows={6} cols={5} />
      ) : roles.isError && !roles.data ? (
        <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No roles yet"
          message={canCreate ? 'Create a role for each job, then give it to your staff.' : 'Roles will appear here once a manager creates them.'}
          action={canCreate ? <Button variant="secondary" icon={Plus} onClick={() => navigate('/roles/new')}>New role</Button> : undefined}
        />
      ) : (
        <DataTable caption="Roles">
          <thead>
            <tr>
              <Th>Role</Th>
              <Th className="hidden lg:table-cell">Description</Th>
              <Th className="text-right">Members</Th>
              <Th className="text-right">Permissions</Th>
              <Th><span className="sr-only">Type</span></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} {...rowProps(() => navigate(`/roles/${r.id}`), r.editable ? `Edit ${r.name}` : `View ${r.name}`)}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="t-body-strong text-fg">{r.name}</span>
                    {!r.editable && (
                      <span title="You can't edit this role" className="inline-flex text-fg3">
                        <Lock aria-hidden className="size-4" />
                        <span className="sr-only">(you can't edit this role)</span>
                      </span>
                    )}
                  </span>
                  {r.description && <span className="t-support mt-0.5 block text-fg2 lg:hidden">{r.description}</span>}
                </Td>
                <Td className="t-support hidden max-w-[420px] text-fg2 lg:table-cell">
                  <span className="line-clamp-2">{r.description || <span className="text-fg3">—</span>}</span>
                </Td>
                <Td className="text-right tabular-nums">{r.member_count}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums text-fg2">
                  {total !== null ? `${r.permissions.length} of ${total}` : r.permissions.length}
                </Td>
                <Td className="w-0 text-right">{r.is_system && <StatusChip label="Built-in" tone="info" icon={BadgeCheck} />}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  )
}
