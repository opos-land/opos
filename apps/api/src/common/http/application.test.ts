import { describe, expect, it, vi } from 'vitest'
import { applicationFromOrigin, requireOriginForSession } from './application'

const env = {
  PORTAL_URL: 'https://opos.land',
  PANEL_URL: 'https://panel.opos.land/',
}

describe('applicationFromOrigin', () => {
  it('names the application whose address the Origin is', () => {
    expect(applicationFromOrigin('https://opos.land', env)).toBe('portal')
    expect(applicationFromOrigin('https://panel.opos.land', env)).toBe('panel')
  })

  it.each([
    'https://api.opos.land',
    'https://evil.opos.land',
    'https://panel.opos.land.evil.example',
    'http://opos.land',
    'https://opos.land:8443',
    'https://opos.land/',
    'https://OPOS.land',
    'null',
    '',
  ])('refuses %s, a sibling subdomain or lookalike included', (origin) => {
    expect(applicationFromOrigin(origin, env)).toBeNull()
  })

  it.each([undefined, null, 42, ['https://opos.land']])('refuses %j, not a string', (origin) => {
    expect(applicationFromOrigin(origin, env)).toBeNull()
  })
})

describe('requireOriginForSession', () => {
  const run = (method: string, headers: Record<string, string>) => {
    const json = vi.fn()
    const res = { status: vi.fn(() => ({ json })) }
    const next = vi.fn()
    requireOriginForSession(env)({ method, headers }, res, next)
    return { json, res, next }
  }
  const cookie = 'opos_portal_access=abc'

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'answers 403 request.origin-denied to a %s with a session cookie and a foreign Origin',
    (method) => {
      const { res, json, next } = run(method, { cookie, origin: 'https://api.opos.land' })

      expect(res.status).toHaveBeenCalledWith(403)
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'request.origin-denied' }))
      expect(next).not.toHaveBeenCalled()
    },
  )

  it('answers 403 to a request that changes state with a session cookie and no Origin', () => {
    const { res, next } = run('POST', { cookie })

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['opos_panel_access', 'opos_portal_refresh', 'opos_panel_refresh'])(
    'counts %s as a session cookie',
    (name) => {
      expect(run('POST', { cookie: `a=b; ${name}=x` }).res.status).toHaveBeenCalledWith(403)
    },
  )

  it('lets the Origin of either application through', () => {
    expect(run('PUT', { cookie, origin: 'https://opos.land' }).next).toHaveBeenCalled()
    expect(run('DELETE', { cookie, origin: 'https://panel.opos.land' }).next).toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not look at a %s', (method) => {
    expect(run(method, { cookie, origin: 'https://evil.example' }).next).toHaveBeenCalled()
  })

  it('does not look at a request without a session cookie', () => {
    expect(run('POST', { origin: 'https://evil.example' }).next).toHaveBeenCalled()
    expect(run('POST', { cookie: 'opos_google=x; other=y' }).next).toHaveBeenCalled()
  })
})
