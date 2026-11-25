import { fillDocument } from './html'
import { type HeadContext, pageHead, plainHead } from './routes'

/** Where the documents are for: the portal's own origin, and what their heads are made from. */
export interface Site {
  /** The origin every page's address is given under, set by the deployment and never by a request. */
  origin: string
  context: HeadContext
  /** Hears why a page got the plain head. */
  report: (error: unknown) => void
}

/**
 * The portal's document for the page at an address, with that page's head, and the status the
 * page answers with. A page whose head cannot be made, the API out of reach for one, gets the
 * plain head: the portal opens as it would without the server.
 */
export async function documentFor(html: string, pathname: string, site: Site) {
  const head = await pageHead(pathname, site.context).catch((error: unknown) => {
    site.report(error)
    return plainHead(site.context.translators, pathname.replace(/\/+$/, '') || '/')
  })
  return { status: head.status, html: fillDocument(html, head, site.origin) }
}
