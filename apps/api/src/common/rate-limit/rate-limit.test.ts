import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { type AccessTokenVerifier, type TokenCheck } from '../guards/access-token'
import { rateLimitTracker } from './rate-limit'

const env = { PORTAL_URL: 'https://opos.land', PANEL_URL: 'https://panel.opos.land' }

/** A verifier that gives every token the same outcome. */
const verifying = (check: TokenCheck) => ({
  verify: vi.fn<AccessTokenVerifier['verify']>(() => Promise.resolve(check)),
  close: vi.fn(),
})

const context = {} as ExecutionContext

const req = (ip: string, headers: Record<string, string> = {}) => ({ ip, headers })

const portal = { cookie: 'opos_portal_access=abc', origin: 'https://opos.land' }

describe('rateLimitTracker', () => {
  it('counts a valid token in the session cookie against its session', async () => {
    const sessionId = randomUUID()
    const verifier = verifying({
      status: 'valid',
      payload: { sub: randomUUID(), session_id: sessionId },
    })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', portal), context)).toBe(
      `session:${sessionId}`,
    )
    expect(verifier.verify).toHaveBeenCalledWith('abc')
  })

  it.each([
    ['no session_id', {}],
    ['an empty session_id', { session_id: '' }],
    ['a session_id that is no string', { session_id: 7 }],
  ])('counts a valid token with %s against the account', async (_, claims) => {
    const sub = randomUUID()
    const verifier = verifying({ status: 'valid', payload: { sub, ...claims } })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', portal), context)).toBe(
      `account:${sub}`,
    )
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
