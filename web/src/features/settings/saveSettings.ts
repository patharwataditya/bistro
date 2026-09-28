import { ApiError } from '@/api/errors'
import type { RestaurantSettings } from '@/api/types'
import type { SettingsUpdate, TaxRatesIn } from './api'
import { generalDiff, taxesBody, taxesChanged, type SettingsValues } from './settingsForm'

/** Thrown when the general part saved but the tax table then failed: keep what landed. */
export class PartialSave extends Error {
  constructor(readonly saved: RestaurantSettings, readonly error: ApiError) {
    super(error.message)
  }
}

export interface SettingsWriters {
  patch: (body: SettingsUpdate) => Promise<RestaurantSettings>
  putTaxes: (body: TaxRatesIn) => Promise<RestaurantSettings>
}

/**
 * Saves an edit that started from `start`: the general fields (only what changed) then the
 * tax table, each against the version the previous step returned. If the taxes fail after
 * the general part landed, throws PartialSave carrying the saved copy.
 */
export async function saveSettings(start: RestaurantSettings, v: SettingsValues, api: SettingsWriters): Promise<RestaurantSettings> {
  let current = start
  const changes = generalDiff(start, v)
  if (Object.keys(changes).length > 0) current = await api.patch({ version: current.version, ...changes })
  if (taxesChanged(start, v.taxes)) {
    try {
      current = await api.putTaxes({ version: current.version, tax_rates: taxesBody(v.taxes) })
    } catch (e) {
      if (current !== start && e instanceof ApiError) throw new PartialSave(current, e)
      throw e
    }
  }
  return current
}

export const STALE_MESSAGE = 'Someone else changed these settings. Their version is shown now — make your changes again.'

/**
 * The one message shown (inline, above the form) after a failed save. `unplaced` is what
 * couldn't be attached to a field (null when every error landed next to its input).
 */
export function saveFailureMessage(e: ApiError | PartialSave, unplaced: string | null): string | null {
  const err = e instanceof PartialSave ? e.error : e
  if (err.kind === 'stale') return e instanceof PartialSave ? `General settings saved, but the taxes weren't. ${STALE_MESSAGE}` : STALE_MESSAGE
  if (e instanceof PartialSave) return `General settings saved, but the taxes weren't: ${unplaced ?? 'check the highlighted tax rows.'}`
  return unplaced
}

/**
 * Whether fresh server data becomes the form's baseline. Only while nothing is being edited
 * or saved: otherwise a background refetch would move the version under the edit, and a save
 * would silently overwrite someone else's change instead of being answered STALE.
 */
export function adoptsFreshData(fresh: RestaurantSettings | undefined, base: RestaurantSettings | null, dirty: boolean, saving: boolean): fresh is RestaurantSettings {
  return !!fresh && fresh !== base && !dirty && !saving
}
