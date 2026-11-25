import { documentFor, type Site } from './document'
import { createSite } from './site'

// The dev server's side of the head: dev.ts loads this module through Vite, so that its macros and
// the workspace's sources are compiled as the portal's own are.

let site: Promise<Site> | undefined

/**
 * The dev server's document with the head of the page at `url`, as a deployment's server fills it.
 * The dev server reaches the API where the browser does, and answers every page with 200.
 */
export async function devDocument(
  html: string,
  url: string,
  options: { origin: string; apiUrl: string },
) {
  site ??= createSite({
    ...options,
    internalApiUrl: options.apiUrl,
    report: (error) => console.error('The plain head was served:', error),
  })
  const { pathname } = new URL(url, 'http://portal.invalid')
  return (await documentFor(html, pathname, await site)).html
}
