import { describe, expect, it } from 'vitest'
import { clearSessionCookies, readSessionCookies, setSessionCookies } from './session-cookies'

const session = {
  access_token: 'access.jwt.token',
  refresh_token: 'refresh-token',
  expires_in: 900,
  expires_at: 1_900_000_900,
  token_type: 'bearer',
}

const local = { API_URL: 'http://api.opos.localhost:3001' }
const https = { API_URL: 'https://api.opos.land' }

interface Call {
  name: string
  value?: string
  options: Record<string, unknown>
}

function recorder() {
  const set: Call[] = []
  const cleared: Call[] = []
  return {
    set,
    cleared,
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        set.push({ name, value, options })
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cleared.push({ name, options })
      },
    },
  }
}

describe('setSessionCookies', () => {
  // An admin signs in again every 30 minutes (docs/adr/0030), so the refresh cookie of the admin
  // application lives no longer than that.
  it('keeps the refresh cookie of the admin application for 30 minutes', () => {
    const { res, set } = recorder()

    setSessionCookies(res, 'admin', session, local, 1_900_000_000)

    expect(set.map((cookie) => [cookie.name, cookie.options.maxAge])).toEqual([
      ['opos_admin_access', 900_000],
      ['opos_admin_refresh', 30 * 60 * 1000],
    ])
  })

  it('sets the access and the refresh cookie of the application, and no Domain', () => {
    const { res, set } = recorder()

    setSessionCookies(res, 'panel', session, local, 1_900_000_000)

    expect(set).toEqual([
      {
        name: 'opos_panel_access',
        value: 'access.jwt.token',
        options: { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 900_000, secure: false },
      },
      {
        name: 'opos_panel_refresh',
        value: 'refresh-token',
        options: {
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
          maxAge: 30 * 24 * 3600 * 1000,
          secure: false,
        },
      },
    ])
    expect(set.every(({ options }) => !('domain' in options))).toBe(true)
  })

  it('names the portal pair for the portal', () => {
    const { res, set } = recorder()

    setSessionCookies(res, 'portal', session, local, 1_900_000_000)

    expect(set.map(({ name }) => name)).toEqual(['opos_portal_access', 'opos_portal_refresh'])
  })

  it('ends the access cookie with the token, by its exp', () => {
    const { res, set } = recorder()

    setSessionCookies(res, 'portal', session, local, 1_900_000_400)

    expect(set[0]?.options.maxAge).toBe(500_000)
  })

  it('is Secure when API_URL is https, and only then', () => {
    const secure = recorder()
    const plain = recorder()

    setSessionCookies(secure.res, 'portal', session, https, 1_900_000_000)
    setSessionCookies(plain.res, 'portal', session, local, 1_900_000_000)

    expect(secure.set.map(({ options }) => options.secure)).toEqual([true, true])
    expect(plain.set.map(({ options }) => options.secure)).toEqual([false, false])
  })
})

describe('clearSessionCookies', () => {
  it('clears the pair of the application with the paths and attributes it was set with', () => {
    const { res, cleared } = recorder()

    clearSessionCookies(res, 'portal', https)

    expect(cleared).toEqual([
      {
        name: 'opos_portal_access',
        options: { httpOnly: true, sameSite: 'strict', path: '/', secure: true },
      },
      {
        name: 'opos_portal_refresh',
        options: { httpOnly: true, sameSite: 'strict', path: '/auth', secure: true },
      },
    ])
  })
})

describe('readSessionCookies', () => {
  const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} })

  it("reads the application's own pair and nothing of the other", () => {
    const cookie =
      'opos_portal_access=p-a; opos_portal_refresh=p-r; opos_panel_access=n-a; opos_panel_refresh=n-r'

    expect(readSessionCookies(req(cookie), 'portal')).toEqual({ access: 'p-a', refresh: 'p-r' })
    expect(readSessionCookies(req(cookie), 'panel')).toEqual({ access: 'n-a', refresh: 'n-r' })
  })

  it('leaves out what is missing', () => {
    expect(readSessionCookies(req(), 'portal')).toEqual({})
    expect(readSessionCookies(req('opos_portal_refresh=r'), 'portal')).toEqual({ refresh: 'r' })
  })

  it('decodes a value and ignores unrelated and malformed cookies', () => {
    expect(readSessionCookies(req('x=%E0%A4%A; opos_portal_access=a%2Bb; y'), 'portal')).toEqual({
      access: 'a+b',
    })
  })

  it('takes the first of a name sent twice', () => {
    expect(
      readSessionCookies(req('opos_portal_access=one; opos_portal_access=two'), 'portal'),
    ).toEqual({
      access: 'one',
    })
  })
})
