/**
 * The requests of a page that leave the boundary (PLAN.md 15.2): to an origin other than the
 * applications' and the API's. Only a URL that goes out over the network counts, so `data:`,
 * `blob:` and `about:` do not.
 */
export function requestsOutside(urls: string[], allowedOrigins: string[]) {
  return urls.filter((url) => {
    const { protocol, origin } = new URL(url)
    return /^https?:$/.test(protocol) && !allowedOrigins.includes(origin)
  })
}
