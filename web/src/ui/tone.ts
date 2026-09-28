/** Semantic colour roles for status — never raw colours. Class strings are static for Tailwind. */
export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'cleaning'

export const TONE: Record<Tone, { fg: string; bg: string; solid: string; stripe: string }> = {
  accent: { fg: 'text-accent', bg: 'bg-accent-soft', solid: 'bg-accent text-on-accent', stripe: 'bg-accent' },
  success: { fg: 'text-success', bg: 'bg-success-soft', solid: 'bg-success text-surface', stripe: 'bg-success' },
  warning: { fg: 'text-warning', bg: 'bg-warning-soft', solid: 'bg-warning text-surface', stripe: 'bg-warning' },
  danger: { fg: 'text-danger', bg: 'bg-danger-soft', solid: 'bg-danger text-surface', stripe: 'bg-danger' },
  info: { fg: 'text-info', bg: 'bg-info-soft', solid: 'bg-info text-surface', stripe: 'bg-info' },
  neutral: { fg: 'text-neutral', bg: 'bg-neutral-soft', solid: 'bg-neutral text-surface', stripe: 'bg-neutral' },
  cleaning: { fg: 'text-cleaning', bg: 'bg-cleaning-soft', solid: 'bg-cleaning text-surface', stripe: 'bg-cleaning' },
}
