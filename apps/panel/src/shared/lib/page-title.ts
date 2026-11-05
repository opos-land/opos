import { useLingui } from '@lingui/react/macro'
import { useEffect } from 'react'

const SEPARATOR = ' · '

/** A tab title: the parts, most specific first and the missing ones left out, then the panel. */
export function formatTitle(parts: readonly (string | undefined)[], application: string) {
  const named = parts.filter((part): part is string => Boolean(part?.trim()))
  return [...named, application].join(SEPARATOR)
}

interface Claim {
  title: string
  screen: boolean
}

// The mounted titles in mount order: the newest screen's wins, else the newest page's.
const claims: Claim[] = []
let initial: string | undefined

function show() {
  initial ??= document.title
  const claim = claims.findLast((entry) => entry.screen) ?? claims.at(-1)
  document.title = claim?.title ?? initial
}

function useTitle(parts: readonly (string | undefined)[], screen: boolean) {
  const { t } = useLingui()
  const title = formatTitle(parts, t`OPOS panel`)
  useEffect(() => {
    const claim = { title, screen }
    claims.push(claim)
    show()
    return () => {
      claims.splice(claims.indexOf(claim), 1)
      show()
    }
  }, [title, screen])
}

/**
 * Names the page in the browser tab (PLAN.md 3.2): the page, then what it belongs to. Every page
 * calls it before its first return, so the title holds while the page loads.
 */
export function usePageTitle(...parts: (string | undefined)[]) {
  useTitle(parts, false)
}

/** The title of a screen that stands in for a page's content; it wins over the page's own. */
export function useScreenTitle(...parts: (string | undefined)[]) {
  useTitle(parts, true)
}
