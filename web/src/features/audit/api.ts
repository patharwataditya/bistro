/**
 * Audit log reads. The log is paged newest-first by `before_id`; only the newest page is
 * polled, and new entries are merged on top, so older pages someone has scrolled through are
 * never refetched (or reshuffled) in the background.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys, type AuditFilter } from '@/api/queries'
import type { AuditEntry, AuditPage, Page, StaffMember } from '@/api/types'

export const AUDIT_PAGE_SIZE = 50
const POLL_MS = 30_000

export function fetchAuditPage(filter: AuditFilter, beforeId: number | null, signal?: AbortSignal): Promise<AuditPage> {
  return request<AuditPage>('/audit-logs', {
    query: {
      action: filter.action, actor_id: filter.actorId, entity_type: filter.entityType,
      since: filter.since, until: filter.until, before_id: beforeId, limit: AUDIT_PAGE_SIZE,
    },
    signal,
  })
}

/** Everyone who could appear as an actor, deactivated staff included. Only with staff.view. */
export function useAuditActors(enabled: boolean) {
  return useQuery<Page<StaffMember>, ApiError>({
    queryKey: keys.users('audit-actors'),
    queryFn: ({ signal }) => request<Page<StaffMember>>('/users', { query: { include_inactive: true, limit: 200 }, signal }),
    enabled,
    staleTime: 60_000,
  })
}

export interface MergedLog {
  entries: AuditEntry[]
  /**
   * More new entries arrived than one poll returns, so they can't be joined to the loaded list
   * without a gap. The screen offers to reload from the top instead.
   */
  newerHidden: boolean
}

/** Loaded pages plus the latest poll of the newest page, deduplicated by id, newest first. */
export function mergeAuditEntries(pages: readonly AuditPage[], head: AuditPage | undefined): MergedLog {
  const seen = new Set<number>()
  const loaded: AuditEntry[] = []
  for (const page of pages) {
    for (const e of page.items) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        loaded.push(e)
      }
    }
  }
  if (!head) return { entries: loaded, newerHidden: false }
  const newest = loaded.reduce((max, e) => Math.max(max, e.id), 0)
  const fresh = head.items.filter((e) => e.id > newest && !seen.has(e.id))
  if (fresh.length > 0 && fresh.length === head.items.length && head.next_before_id !== null) {
    return { entries: loaded, newerHidden: true }
  }
  return { entries: [...fresh, ...loaded], newerHidden: false }
}

export function useAuditLog(filter: AuditFilter) {
  const client = useQueryClient()
  const filterKey = JSON.stringify(filter)
  const listKey = keys.audit(filterKey)
  const headKey = useMemo(() => [...keys.audit(filterKey), 'head'] as const, [filterKey])

  const list = useInfiniteQuery<AuditPage, ApiError, { pages: AuditPage[] }, readonly unknown[], number | null>({
    queryKey: listKey,
    queryFn: async ({ pageParam, signal }) => {
      const page = await fetchAuditPage(filter, pageParam, signal)
      // The first page doubles as the first poll, so polling starts without a second request.
      if (pageParam === null) client.setQueryData(headKey, page)
      return page
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_before_id ?? undefined,
    // Loaded pages are history: new entries arrive through the poll below.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const head = useQuery<AuditPage, ApiError>({
    queryKey: headKey,
    queryFn: ({ signal }) => fetchAuditPage(filter, null, signal),
    enabled: list.data !== undefined,
    staleTime: POLL_MS - 5_000,
    refetchInterval: POLL_MS,
  })

  const merged = useMemo(() => mergeAuditEntries(list.data?.pages ?? [], head.data), [list.data, head.data])

  return {
    list,
    head,
    ...merged,
    /** Reload from the newest entry (drops the older pages; they load again on scroll). */
    showNewer: () => void client.resetQueries({ queryKey: listKey, exact: true }),
  }
}
