import { useLingui } from '@lingui/react/macro'
import { useEffect, useSyncExternalStore } from 'react'

const SEPARATOR = ' · '

/** The parts of a title, the missing and blank ones left out. */
const named = (parts: readonly (string | undefined)[]) =>
  parts.filter((part): part is string => Boolean(part?.trim()))

/** A tab title: the parts, most specific first and the missing ones left out, then the panel. */
export function formatTitle(parts: readonly (string | undefined)[], application: string) {
  return [...named(parts), application].join(SEPARATOR)
}

interface Claim {
  title: string
  parts: string[]
  screen: boolean
}

// The mounted titles in mount order: the newest screen's wins, else the newest page's.
const claims: Claim[] = []
let initial: string | undefined

const NO_TRAIL: readonly string[] = []
// The shown title's parts, the most general first, for the breadcrumb.
let trail = NO_TRAIL
const trailListeners = new Set<() => void>()

function show() {
  initial ??= document.title
  const claim = claims.findLast((entry) => entry.screen) ?? claims.at(-1)
  document.title = claim?.title ?? initial
  const next = claim ? claim.parts.toReversed() : NO_TRAIL
  if (next.join(SEPARATOR) !== trail.join(SEPARATOR)) {
    trail = next
    trailListeners.forEach((listener) => listener())
  }
}

function useTitle(parts: readonly (string | undefined)[], screen: boolean) {
  const { t } = useLingui()
  const title = formatTitle(parts, t`OPOS panel`)
  // The parts as one value, so the effect runs only when they change.
  const key = JSON.stringify(named(parts))
  useEffect(() => {
    const claim = { title, parts: JSON.parse(key) as string[], screen }
    claims.push(claim)
    show()
    return () => {
      claims.splice(claims.indexOf(claim), 1)
      show()
    }
  }, [title, key, screen])
}

function subscribeToTrail(listener: () => void) {
  trailListeners.add(listener)
  return () => trailListeners.delete(listener)
}

/**
 * Names the page in the browser tab: the page, then what it belongs to. Every page
 * calls it before its first return, so the title holds while the page loads.
 */
export function usePageTitle(...parts: (string | undefined)[]) {
  useTitle(parts, false)
}

/** The title of a screen that stands in for a page's content; it wins over the page's own. */
export function useScreenTitle(...parts: (string | undefined)[]) {
  useTitle(parts, true)
}

/** The parts of the title in the tab, the most general first: what the page belongs to, then the page. */
export function usePageTrail(): readonly string[] {
  return useSyncExternalStore(
    subscribeToTrail,
    () => trail,
    () => NO_TRAIL,
  )
}
