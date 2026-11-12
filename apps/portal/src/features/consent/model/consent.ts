import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { readStorage, writeStorage } from '../../../shared/lib/storage'
import { TRACKERS } from '../trackers'
import { reloadPage } from './reload'
import { CONSENT_CATEGORIES, type ConsentCategory, type Tracker } from './tracker'

/** Where this browser keeps the visitor's choice; strictly necessary to honour it. */
export const CONSENT_STORAGE_KEY = 'opos-portal-consent'

/** A choice is asked again this many months after it was made. */
const VALID_MONTHS = 12

/** The categories the visitor allowed, in the order of CONSENT_CATEGORIES. */
export type ConsentChoice = readonly ConsentCategory[]

const storedChoice = z.object({
  /** The trackers listed when the choice was made: one missing here asks again. */
  offered: z.array(z.string()),
  granted: z.array(z.enum(CONSENT_CATEGORIES)),
  decidedAt: z.iso.datetime(),
})

const inOrder = (granted: readonly ConsentCategory[]): ConsentChoice =>
  CONSENT_CATEGORIES.filter((category) => granted.includes(category))

/** The choice made in a browser that keeps nothing (private mode, blocked site data), for this page. */
let unsaved: string | null = null

function readChoice(): ConsentChoice | null {
  const raw = readStorage(CONSENT_STORAGE_KEY) ?? unsaved
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const stored = storedChoice.safeParse(parsed)
  if (!stored.success) return null

  const expires = new Date(stored.data.decidedAt)
  expires.setMonth(expires.getMonth() + VALID_MONTHS)
  if (Date.now() >= expires.getTime()) return null
  if (TRACKERS.some((tracker) => !stored.data.offered.includes(tracker.id))) return null
  return inOrder(stored.data.granted)
}

const same = (a: ConsentChoice | null, b: ConsentChoice | null) =>
  a === b ||
  (a !== null && b !== null && a.length === b.length && a.every((category, i) => category === b[i]))

let last: ConsentChoice | null = null

/**
 * The visitor's choice for the listed trackers, the same array while it does not change; null
 * while there is none to honour: never asked, a tracker added since, or older than twelve months.
 */
export function currentChoice(): ConsentChoice | null {
  const next = readChoice()
  if (!same(next, last)) last = next
  return last
}

/** Follows a choice made in another tab, which the storage event announces. */
function followOtherTabs(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

const listeners = new Set<() => void>()

/** Follows the choice made in this tab and in the others. */
function subscribe(listener: () => void) {
  listeners.add(listener)
  const unfollow = followOtherTabs(listener)
  return () => {
    listeners.delete(listener)
    unfollow()
  }
}

export const useConsentChoice = () => useSyncExternalStore(subscribe, currentChoice)

/** The categories of the listed trackers, each once, in the order the banner offers them. */
export const offeredCategories = (): ConsentCategory[] =>
  CONSENT_CATEGORIES.filter((category) => TRACKERS.some((tracker) => tracker.category === category))

/** Expires a cookie of this site on every domain a script may have set it for. */
function removeCookie(name: string) {
  const labels = window.location.hostname.split('.')
  const domains = labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'))
  for (const domain of [null, ...domains]) {
    document.cookie = `${name}=; max-age=0; path=/${domain ? `; domain=${domain}` : ''}`
  }
}

/** The trackers started on this page load. */
const started = new WeakSet<Tracker>()

/**
 * Starts the listed trackers the choice allows, each once a page load. A started tracker the
 * choice no longer allows cannot be stopped in place: its cookies go and the page loads again.
 */
export function applyConsent(choice: ConsentChoice | null) {
  const granted = choice ?? []
  const withdrawn = TRACKERS.filter(
    (tracker) => started.has(tracker) && !granted.includes(tracker.category),
  )
  if (withdrawn.length > 0) {
    withdrawn.flatMap((tracker) => tracker.cookies ?? []).forEach(removeCookie)
    reloadPage()
    return
  }
  for (const tracker of TRACKERS) {
    if (!granted.includes(tracker.category) || started.has(tracker)) continue
    started.add(tracker)
    tracker.load()
  }
}

/** Keeps the visitor's choice for the listed trackers in this browser, and applies it at once. */
export function decideConsent(granted: readonly ConsentCategory[]) {
  const raw = JSON.stringify({
    offered: TRACKERS.map((tracker) => tracker.id),
    granted: inOrder(granted),
    decidedAt: new Date().toISOString(),
  })
  writeStorage(CONSENT_STORAGE_KEY, raw)
  unsaved = readStorage(CONSENT_STORAGE_KEY) === raw ? null : raw
  listeners.forEach((listener) => listener())
  applyConsent(currentChoice())
}

/**
 * Starts what the visitor allowed on this page load, and applies a choice changed in another tab:
 * mounted once, by the banner. A choice made in this tab applies itself.
 */
export function followConsent() {
  applyConsent(currentChoice())
  return followOtherTabs(() => applyConsent(currentChoice()))
}
