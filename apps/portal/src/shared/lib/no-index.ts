import { useEffect } from 'react'
import { SERVER_HEAD } from './server-head'

/**
 * Asks search engines not to list the page that calls it, for as long as it is shown: a profile is
 * read by whoever is given its address, not found by a search
 * (docs/specs/0016-public-profile.md, P10). Where the server already asked for the page the
 * document opened at, the page takes that over, so it asks once and for as long as it is shown.
 */
export function useNoIndex() {
  useEffect(() => {
    document.head
      .querySelectorAll(`meta[name="robots"][${SERVER_HEAD}]`)
      .forEach((written) => written.remove())
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
}
