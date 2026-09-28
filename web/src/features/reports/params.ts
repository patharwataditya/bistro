/** How the Reports screen reads its range from the URL (so a report can be bookmarked or shared). */
import { PRESETS, rangeError, type DateRange, type Preset } from './range'

export type Choice = Preset | 'custom'

export interface ParsedRange {
  /** What the screen shows: a preset, or the custom range in `custom`. */
  choice: Choice
  custom: DateRange | null
  /**
   * The URL asked for a range that can't be shown (an unknown preset, impossible or out-of-range
   * dates). The screen falls back to Today, but says so and offers the dates to correct.
   */
  problem: { message: string; draft: DateRange } | null
}

export function isPreset(v: string | null): v is Preset {
  return v !== null && (PRESETS as readonly string[]).includes(v)
}

export function parseReportParams(params: URLSearchParams): ParsedRange {
  const preset = params.get('range')
  const start = params.get('start')
  const end = params.get('end')
  const draft = { start: start ?? '', end: end ?? '' }
  const today: ParsedRange = { choice: 'today', custom: null, problem: null }

  if (preset !== null) {
    if (isPreset(preset)) return { ...today, choice: preset }
    return { ...today, problem: { message: "This link's date range isn't recognised, so today is shown. Choose the dates to report on.", draft } }
  }
  if (start === null && end === null) return today
  const error = rangeError(draft.start, draft.end)
  if (error === null) return { choice: 'custom', custom: draft, problem: null }
  return { ...today, problem: { message: `This link's dates can't be used (${error.charAt(0).toLowerCase()}${error.slice(1)}), so today is shown.`, draft } }
}
