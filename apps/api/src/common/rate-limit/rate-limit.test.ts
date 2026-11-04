import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  type AccessTokenPayload,
  type AccessTokenVerifier,
  type TokenCheck,
} from '../guards/access-token'
import { rateLimitTracker } from './rate-limit'

const env = { PORTAL_URL: 'https://opos.land', PANEL_URL: 'https://panel.opos.land' }

/** A verifier that gives every token the same outcome. */
const verifying = (check: TokenCheck) => ({
  verify: vi.fn<AccessTokenVerifier['verify']>(() => Promise.resolve(check)),
  loadKeys: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
})

const context = {} as ExecutionContext

const req = (ip: string, headers: Record<string, string> = {}) => ({ ip, headers })

const portal = { cookie: 'opos_portal_access=abc', origin: 'https://opos.land' }

describe('rateLimitTracker', () => {
  it('counts a valid token at aal2 in the session cookie against its account and level', async () => {
    const sub = randomUUID()
    const verifier = verifying({ status: 'valid', payload: { sub, aal: 'aal2' } })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', portal), context)).toBe(
      `account:${sub}:aal2`,
    )
    expect(verifier.verify).toHaveBeenCalledWith('abc')
  })

  it.each([
    ['at aal1', { aal: 'aal1' }],
    ['with no aal', {}],
    ['with an aal that is no known level', { aal: 'aal3' }],
    ['with an aal that is no string', { aal: 2 }],
  ])('counts a valid token %s against the account alone', async (_, claims) => {
    const sub = randomUUID()
    const verifier = verifying({
      status: 'valid',
      payload: { sub, ...claims } as AccessTokenPayload,
    })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', portal), context)).toBe(
      `account:${sub}`,
    )
  })

  it('never reads the session of a token: two sessions of one account share a counter', async () => {
    const sub = randomUUID()
    const track = (sessionId: string) =>
      rateLimitTracker(
        verifying({ status: 'valid', payload: { sub, aal: 'aal1', session_id: sessionId } }),
        env,
      )(req('192.0.2.1', portal), context)

    expect(await track(randomUUID())).toBe(await track(randomUUID()))
  })

  it('tracks a forged cookie by the address, never the account it names', async () => {
    const verifier = verifying({ status: 'invalid' })
    const cookie = { cookie: 'opos_panel_access=forged', origin: 'https://panel.opos.land' }

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', cookie), context)).toBe(
      'ip:192.0.2.1',
    )
  })

  it('tracks a request without a token by its address', async () => {
    const verifier = verifying({ status: 'invalid' })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1'), context)).toBe('ip:192.0.2.1')
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('ignores Authorization: Bearer, which only the scanner will send', async () => {
    const verifier = verifying({ status: 'valid', payload: { sub: randomUUID() } })
    const headers = { authorization: 'Bearer abc', origin: 'https://opos.land' }

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', headers), context)).toBe(
      'ip:192.0.2.1',
    )
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('counts against the address when verification is unavailable', async () => {
    const track = rateLimitTracker(verifying({ status: 'unavailable' }), env)

    expect(await track(req('192.0.2.1', portal), context)).toBe('ip:192.0.2.1')
  })

  it('tracks an IPv6 address by its /64 network', async () => {
    const track = rateLimitTracker(verifying({ status: 'invalid' }), env)

    const one = await track(req('2001:db8:1:2::1'), context)
    const other = await track(req('2001:db8:1:2:ffff::9'), context)

    expect(one).toBe(other)
  })
})
