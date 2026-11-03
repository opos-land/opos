import { describe, expect, it } from 'vitest'
import { requestsOutside } from './boundary'

const allowed = ['http://opos.localhost:5174', 'http://api.opos.localhost:3001']

describe('requests outside the boundary', () => {
  it('lets the application and the API through, whatever the path', () => {
    expect(
      requestsOutside(
        [
          'http://opos.localhost:5174/',
          'http://opos.localhost:5174/src/main.tsx?t=1',
          'http://api.opos.localhost:3001/me',
        ],
        allowed,
      ),
    ).toEqual([])
  })

  it('names each request to another origin', () => {
    expect(
      requestsOutside(
        [
          'http://opos.localhost:5174/',
          'https://abcdefgh.supabase.co/auth/v1/token',
          'http://127.0.0.1:54321/auth/v1/user',
          'https://fonts.googleapis.com/css2',
        ],
        allowed,
      ),
    ).toEqual([
      'https://abcdefgh.supabase.co/auth/v1/token',
      'http://127.0.0.1:54321/auth/v1/user',
      'https://fonts.googleapis.com/css2',
    ])
  })

  it('tells a port, a scheme and a sibling subdomain apart', () => {
    expect(
      requestsOutside(
        [
          'http://opos.localhost:5175/',
          'https://opos.localhost:5174/',
          'http://panel.opos.localhost:5174/',
        ],
        allowed,
      ),
    ).toHaveLength(3)
  })

  it('does not count a data: or blob: URL, which leaves nothing', () => {
    expect(
      requestsOutside(
        ['data:image/png;base64,AAAA', 'blob:http://opos.localhost:5174/uuid'],
        allowed,
      ),
    ).toEqual([])
  })

  it('does not count about:blank', () => {
    expect(requestsOutside(['about:blank'], allowed)).toEqual([])
  })
})
