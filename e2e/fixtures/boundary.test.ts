import { describe, expect, it } from 'vitest'
import { type PageRequest, requestsOutside } from './boundary'

const panel = 'http://opos.localhost:5174'
const portal = 'http://opos.localhost:5175'
const api = 'http://api.opos.localhost:3001'
const origins = { api, applications: [panel, portal] }

const fetchFrom = (frame: string | null, url: string): PageRequest => ({
  url,
  frameOrigin: frame,
  navigation: false,
})
const goTo = (url: string, frame: string | null = panel): PageRequest => ({
  url,
  frameOrigin: frame,
  navigation: true,
})

describe('requests outside the boundary', () => {
  it('lets a page request its own origin and the API, whatever the path', () => {
    expect(
      requestsOutside(
        [
          fetchFrom(panel, `${panel}/src/main.tsx?t=1`),
          fetchFrom(panel, `${api}/me`),
          fetchFrom(portal, `${portal}/assets/a.js`),
          fetchFrom(portal, `${api}/me`),
        ],
        origins,
      ),
    ).toEqual([])
  })

  it('names a panel page fetching the portal, which no navigation excuses', () => {
    expect(requestsOutside([fetchFrom(panel, `${portal}/assets/a.js`)], origins)).toEqual([
      `${portal}/assets/a.js`,
    ])
  })

  it('names each request to another origin', () => {
    expect(
      requestsOutside(
        [
          fetchFrom(panel, `${panel}/`),
          fetchFrom(panel, 'https://abcdefgh.supabase.co/auth/v1/token'),
          fetchFrom(panel, 'http://127.0.0.1:54321/auth/v1/user'),
          fetchFrom(panel, 'https://fonts.googleapis.com/css2'),
        ],
        origins,
      ),
    ).toEqual([
      'https://abcdefgh.supabase.co/auth/v1/token',
      'http://127.0.0.1:54321/auth/v1/user',
      'https://fonts.googleapis.com/css2',
    ])
  })

  it('lets a navigation go to the panel, the portal or the API', () => {
    expect(
      requestsOutside(
        [goTo(`${portal}/sign-in`), goTo(`${panel}/`), goTo(`${api}/auth/confirm`)],
        origins,
      ),
    ).toEqual([])
  })

  it('names a navigation to any other origin', () => {
    expect(requestsOutside([goTo('https://abcdefgh.supabase.co/auth/v1/verify')], origins)).toEqual(
      ['https://abcdefgh.supabase.co/auth/v1/verify'],
    )
  })

  it('counts a request of a frame without an origin as outside, unless it goes to the API', () => {
    expect(
      requestsOutside(
        [
          fetchFrom(null, `${panel}/a.js`),
          fetchFrom(null, `${api}/me`),
          fetchFrom(null, `${portal}/`),
        ],
        origins,
      ),
    ).toEqual([`${panel}/a.js`, `${portal}/`])
  })

  it('tells a port, a scheme and a sibling subdomain apart', () => {
    expect(
      requestsOutside(
        [
          fetchFrom(panel, 'http://opos.localhost:5176/'),
          fetchFrom(panel, 'https://opos.localhost:5174/'),
          fetchFrom(panel, 'http://panel.opos.localhost:5174/'),
        ],
        origins,
      ),
    ).toHaveLength(3)
  })

  it('does not count a data: or blob: URL, which leaves nothing', () => {
    expect(
      requestsOutside(
        [
          fetchFrom(panel, 'data:image/png;base64,AAAA'),
          fetchFrom(panel, `blob:${panel}/uuid`),
          fetchFrom(null, 'about:blank'),
        ],
        origins,
      ),
    ).toEqual([])
  })
})
