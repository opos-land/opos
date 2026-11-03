import { describe, expect, it, vi } from 'vitest'
import { type AccessTokenVerifier, type TokenCheck } from './access-token'
import { credentialOf, verifyOnce } from './request-credential'

const env = { PORTAL_URL: 'https://opos.land', PANEL_URL: 'https://panel.opos.land' }

const req = (headers: Record<string, string>) => ({ headers })

describe('credentialOf', () => {
  it('reads the access cookie of the application the Origin names', () => {
    const cookie = 'opos_portal_access=portal-token; opos_panel_access=panel-token'

    expect(credentialOf(req({ cookie, origin: 'https://opos.land' }), env)).toBe('portal-token')
    expect(credentialOf(req({ cookie, origin: 'https://panel.opos.land' }), env)).toBe(
      'panel-token',
    )
  })

  it('prefers the cookie to Authorization: Bearer', () => {
    expect(
      credentialOf(
        req({
          cookie: 'opos_portal_access=from-cookie',
          origin: 'https://opos.land',
          authorization: 'Bearer from-header',
        }),
        env,
      ),
    ).toBe('from-cookie')
  })

  it('falls back to Authorization: Bearer while the frontends move', () => {
    expect(credentialOf(req({ authorization: 'Bearer from-header' }), env)).toBe('from-header')
    expect(
      credentialOf(req({ origin: 'https://opos.land', authorization: 'Bearer from-header' }), env),
    ).toBe('from-header')
  })

  it.each([
    ['no Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['a sibling subdomain', { origin: 'https://api.opos.land' }],
  ])('takes no session cookie with %s', (_, headers) => {
    expect(credentialOf(req({ cookie: 'opos_portal_access=token', ...headers }), env)).toBe(
      undefined,
    )
  })

  it('never reads the refresh cookie or the other application', () => {
    expect(
      credentialOf(
        req({
          cookie: 'opos_portal_refresh=r; opos_panel_access=other',
          origin: 'https://opos.land',
        }),
        env,
      ),
    ).toBe(undefined)
  })
})

describe('verifyOnce', () => {
  const verifying = (check: TokenCheck) => ({
    verify: vi.fn<AccessTokenVerifier['verify']>(() => Promise.resolve(check)),
    close: vi.fn(),
  })

  it.each<TokenCheck>([
    { status: 'valid', payload: { sub: 'a' } },
    { status: 'invalid' },
    { status: 'unavailable' },
  ])('asks the verifier once per request and token for %j', async (check) => {
    const verifier = verifying(check)
    const request = req({})

    const first = await verifyOnce(request, verifier, 'token')
    const second = await verifyOnce(request, verifier, 'token')

    expect(first).toEqual(check)
    expect(second).toBe(first)
    expect(verifier.verify).toHaveBeenCalledTimes(1)
  })

  it('shares nothing between two requests or two tokens', async () => {
    const verifier = verifying({ status: 'invalid' })
    const request = req({})

    await verifyOnce(request, verifier, 'one')
    await verifyOnce(request, verifier, 'two')
    await verifyOnce(req({}), verifier, 'one')

    expect(verifier.verify).toHaveBeenCalledTimes(3)
  })

  it('shares the outcome of a verification still running', async () => {
    const verifier = verifying({ status: 'unavailable' })
    const request = req({})

    await Promise.all([
      verifyOnce(request, verifier, 'token'),
      verifyOnce(request, verifier, 'token'),
    ])

    expect(verifier.verify).toHaveBeenCalledTimes(1)
  })
})
