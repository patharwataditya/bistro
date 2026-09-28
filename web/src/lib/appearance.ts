import { useSyncExternalStore } from 'react'

/** Exactly three appearances, like the Android app. There is deliberately no "system" option. */
export const APPEARANCES = ['light', 'dark', 'black'] as const
export type Appearance = (typeof APPEARANCES)[number]
export const APPEARANCE_LABEL: Record<Appearance, string> = { light: 'Light', dark: 'Dark', black: 'Black' }

const KEY = 'bistro.appearance'
const listeners = new Set<() => void>()

export function readAppearance(): Appearance {
  try {
    const v = localStorage.getItem(KEY)
    return (APPEARANCES as readonly string[]).includes(v ?? '') ? (v as Appearance) : 'light'
  } catch {
    return 'light'
  }
}

export function applyAppearance(value: Appearance): void {
  document.documentElement.dataset.appearance = value
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', value === 'light' ? '#F6F3EE' : value === 'dark' ? '#141311' : '#000000')
}

export function setAppearance(value: Appearance): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  applyAppearance(value)
  listeners.forEach((l) => l())
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          applyAppearance(readAppearance())
          cb()
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', onStorage)
      }
    },
    readAppearance,
    () => 'light',
  )
}
