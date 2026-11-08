/** A request of a page, as the boundary fixture records it when the page makes it. */
export interface PageRequest {
  url: string
  /** The origin of the frame that made the request, null when that frame has none (`about:blank`). */
  frameOrigin: string | null
  navigation: boolean
}

/**
 * The requests of a page that leave the boundary. A request is inside when it goes
 * to the API, or to the origin of the frame that made it; a navigation may also go to the panel or
 * the portal, since a scenario moves between them and the API's redirects land there. Only a URL
 * that goes out over the network counts, so `data:`, `blob:` and `about:` do not.
 */
export function requestsOutside(
  requests: PageRequest[],
  { api, applications }: { api: string; applications: string[] },
) {
  return requests
    .filter(({ url, frameOrigin, navigation }) => {
      const { protocol, origin } = new URL(url)
      if (!/^https?:$/.test(protocol) || origin === api) return false
      return !(origin === frameOrigin || (navigation && applications.includes(origin)))
    })
    .map(({ url }) => url)
}
