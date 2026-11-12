import { describe, expect, it, vi } from 'vitest'
import {
  type ApplicationUrls,
  applicationFromOrigin,
  applicationOrigins,
  applicationUrl,
  requireOriginForSession,
  restrictAdminOrigin,
} from './application'

const env = {
  PORTAL_URL: 'https://opos.land',
  PANEL_URL: 'https://panel.opos.land/',
  ADMIN_URL: 'https://admin.opos.land',
}
// An API that does not serve the admin application names no address for it.
const withoutAdmin = { PORTAL_URL: env.PORTAL_URL, PANEL_URL: env.PANEL_URL }

describe('applicationFromOrigin', () => {
  it('names the application whose address the Origin is', () => {
    expect(applicationFromOrigin('https://opos.land', env)).toBe('portal')
    expect(applicationFromOrigin('https://panel.opos.land', env)).toBe('panel')
    expect(applicationFromOrigin('https://admin.opos.land', env)).toBe('admin')
  })

  it('knows no admin application where the API has no address for it', () => {
    expect(applicationFromOrigin('https://admin.opos.land', withoutAdmin)).toBeNull()
    expect(applicationFromOrigin('https://opos.land', withoutAdmin)).toBe('portal')
    expect(applicationUrl('admin', withoutAdmin)).toBeUndefined()
    expect(applicationOrigins(withoutAdmin)).toEqual([
      'https://opos.land',
      'https://panel.opos.land',
    ])
  })

  it('lists the origin of every application it serves', () => {
    expect(applicationOrigins(env)).toEqual([
      'https://opos.land',
      'https://panel.opos.land',
      'https://admin.opos.land',
    ])
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

  it.each([
    'opos_panel_access',
    'opos_portal_refresh',
    'opos_panel_refresh',
    'opos_admin_access',
    'opos_admin_refresh',
  ])('counts %s as a session cookie', (name) => {
    expect(run('POST', { cookie: `a=b; ${name}=x` }).res.status).toHaveBeenCalledWith(403)
  })

  it('lets the Origin of each application through', () => {
    expect(run('PUT', { cookie, origin: 'https://opos.land' }).next).toHaveBeenCalled()
    expect(run('DELETE', { cookie, origin: 'https://panel.opos.land' }).next).toHaveBeenCalled()
    expect(run('POST', { cookie, origin: 'https://admin.opos.land' }).next).toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not look at a %s', (method) => {
    expect(run(method, { cookie, origin: 'https://evil.example' }).next).toHaveBeenCalled()
  })

  it('does not look at a request without a session cookie', () => {
    expect(run('POST', { origin: 'https://evil.example' }).next).toHaveBeenCalled()
    expect(run('POST', { cookie: 'opos_google=x; other=y' }).next).toHaveBeenCalled()
  })
})

// The admin application reaches only what it needs (docs/adr/0030): a flaw in it can neither
// change the admin's credentials nor reach a route of the panel or the portal.
describe('restrictAdminOrigin', () => {
  const run = (
    method: string,
    path: string,
    origin: string | undefined,
    source: ApplicationUrls = env,
  ) => {
    const json = vi.fn()
    const res = { status: vi.fn(() => ({ json })) }
    const next = vi.fn()
    restrictAdminOrigin(source)(
      { method, path, headers: origin === undefined ? {} : { origin } },
      res,
      next,
    )
    return { json, res, next }
  }
  const admin = 'https://admin.opos.land'

  it.each([
    ['GET', '/admin/tenants'],
    ['POST', '/admin/tenants'],
    ['DELETE', '/admin/tenants/00000000-0000-4000-8000-000000000000'],
    ['GET', '/admin/actions'],
    ['POST', '/auth/sign-in'],
    ['POST', '/auth/refresh'],
    ['POST', '/auth/sign-out'],
    ['POST', '/auth/mfa/verify'],
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['GET', '/health'],
  ])('lets %s %s through from the admin application', (method, path) => {
    expect(run(method, path, admin).next).toHaveBeenCalled()
  })

  it.each([
    ['POST', '/auth/sign-up'],
    ['POST', '/auth/resend'],
    ['POST', '/auth/verify'],
    ['GET', '/auth/google'],
    ['POST', '/auth/password/forgot'],
    ['PUT', '/auth/password'],
    ['POST', '/auth/mfa/enroll'],
    ['POST', '/auth/mfa/enable'],
    ['POST', '/auth/mfa/recover'],
    ['DELETE', '/auth/mfa'],
    ['DELETE', '/me'],
    ['GET', '/me/memberships'],
    ['GET', '/me/schedule'],
    ['GET', '/tenants/current'],
    ['POST', '/invitations/accept'],
    ['GET', '/public/tenants/convention-a'],
    ['GET', '/administration'],
    ['GET', '/admin-tools'],
    ['GET', '/me/'],
    ['POST', '/auth/sign-in/'],
  ])('answers 403 request.origin-denied to %s %s from the admin application', (method, path) => {
    const { res, json, next } = run(method, path, admin)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'request.origin-denied' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('lets a preflight through, which the browser sends before any of them', () => {
    expect(run('OPTIONS', '/tenants/current', admin).next).toHaveBeenCalled()
  })

  it.each(['https://opos.land', 'https://panel.opos.land', 'https://evil.example', undefined])(
    'does not look at a request from %s',
    (origin) => {
      expect(run('PUT', '/auth/password', origin).next).toHaveBeenCalled()
    },
  )

  it('does not look at anything where the API serves no admin application', () => {
    expect(run('PUT', '/auth/password', admin, withoutAdmin).next).toHaveBeenCalled()
  })
})
