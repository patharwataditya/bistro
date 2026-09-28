/**
 * The offset to show once the server says how many people there are. Deactivating (or someone
 * else removing) the last row of the last page would otherwise leave an empty page: step back
 * to the last page that has rows. `null` means the offset is fine as it is.
 */
export function clampOffset(offset: number, total: number, pageSize: number): number | null {
  if (offset <= 0) return null
  if (total <= 0) return 0
  if (offset < total) return null
  return Math.floor((total - 1) / pageSize) * pageSize
}
