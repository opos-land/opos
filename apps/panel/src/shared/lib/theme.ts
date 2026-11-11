import { type Theme, themeSchema } from '@opos/contract'
import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from './storage'

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

/** Where this browser keeps the theme chosen while no account is signed in. */
export const THEME_STORAGE_KEY = 'opos-panel-theme'

export const isTheme = (value: unknown): value is Theme => themeSchema.safeParse(value).success

let shown: Theme = 'light'
const listeners = new Set<() => void>()

/** The `dark` class the tokens of styles.css follow, and the colour scheme of the browser's own controls. */
function show(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  shown = theme
  listeners.forEach((listener) => listener())
}

/** Stops following the system's theme; set while it is followed. */
let unfollow: (() => void) | null = null

/**
 * Shows a chosen theme, or with `null` the system's, followed as the system changes it until the
 * next call.
 */
export function applyTheme(choice: Theme | null) {
  unfollow?.()
  unfollow = null
  if (choice) {
    show(choice)
    return
  }
  const system = window.matchMedia(SYSTEM_DARK)
  const follow = () => show(system.matches ? 'dark' : 'light')
  follow()
  system.addEventListener('change', follow)
  unfollow = () => system.removeEventListener('change', follow)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The theme on screen, whoever chose it, for a control that shows or flips it. */
export const useShownTheme = () => useSyncExternalStore(subscribe, () => shown)

/** The theme chosen in this browser for the visits with no account signed in; null for none. */
export function signedOutTheme(): Theme | null {
  const stored = readStorage(THEME_STORAGE_KEY)
  return isTheme(stored) ? stored : null
}

/**
 * Keeps `theme` in this browser for the visits with no account signed in, and shows it. It is
 * the visitor's, not an account's: a signed-in account keeps its theme on the account.
 */
export function chooseSignedOutTheme(theme: Theme) {
  writeStorage(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}
