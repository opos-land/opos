import { useEffect } from 'react'

/**
 * Asks search engines not to list the page that calls it, for as long as it is shown: a profile is
 * read by whoever is given its address, not found by a search
 * (docs/specs/0016-public-profile.md, P10).
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
}
