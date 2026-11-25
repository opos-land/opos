import { useLingui } from '@lingui/react/macro'
import { useEffect } from 'react'
import { formatTitle } from './title'

export { formatTitle }

interface Claim {
  title: string
  screen: boolean
}

// The mounted titles in mount order: the newest screen's wins, else the newest page's.
const claims: Claim[] = []
// What the tab says while nothing on the screen names itself: the portal's name, as the last
// title gave it. Never the title the document came with, which the server wrote for the page it
// opened at (docs/ARCHITECTURE.md, Frontends) and which would name a page that is gone.
let unnamed: string | undefined

function show() {
  const claim = claims.findLast((entry) => entry.screen) ?? claims.at(-1)
  document.title = claim?.title ?? unnamed ?? document.title
}

function useTitle(parts: readonly (string | undefined)[], screen: boolean) {
  const { t } = useLingui()
  const application = t`OPOS`
  const title = formatTitle(parts, application)
  useEffect(() => {
    const claim = { title, screen }
    claims.push(claim)
    unnamed = application
    show()
    return () => {
      claims.splice(claims.indexOf(claim), 1)
      show()
    }
  }, [title, screen, application])
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
