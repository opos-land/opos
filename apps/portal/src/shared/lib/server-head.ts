/**
 * Marks what the server wrote into the head of the document for the address it was asked at: the
 * description, the address of the page and what a preview of a shared link reads
 * (docs/ARCHITECTURE.md, Frontends).
 */
export const SERVER_HEAD = 'data-server-head'

interface Shown {
  location: { pathname: string }
}

/** A router as far as the head follows it: what it shows, and who hears when that changes. */
interface Navigation {
  state: Shown
  subscribe(listener: (state: Shown) => void): () => void
}

/**
 * Drops what the server wrote into the head once the portal shows another address than the
 * document was opened at. It names the page that was left, and a browser that shares the page reads
 * the address it shares from there. The title is the page's own and follows it without this.
 */
export function dropServerHeadOnLeaving(router: Navigation, page: Document = document) {
  const opened = router.state.location.pathname
  const stop = router.subscribe(({ location }) => {
    if (location.pathname === opened) return
    page.head.querySelectorAll(`[${SERVER_HEAD}]`).forEach((element) => element.remove())
    stop()
  })
}
