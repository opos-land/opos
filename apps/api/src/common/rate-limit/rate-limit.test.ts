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

const req = (ip: string, authorization?: string, headers: Record<string, string> = {}) => ({
  ip,
  headers: { ...(authorization ? { authorization } : {}), ...headers },
})

describe('rateLimitTracker', () => {
  it('counts a valid token against the account', async () => {
    const sub = randomUUID()
    const verifier = verifying({ status: 'valid', payload: { sub } })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1', 'Bearer abc'), context)).toBe(
      `account:${sub}`,
    )
    expect(verifier.verify).toHaveBeenCalledWith('abc')
  })

  it('counts a valid token in the session cookie against the account', async () => {
    const sub = randomUUID()
    const verifier = verifying({ status: 'valid', payload: { sub } })
    const cookie = { cookie: 'opos_portal_access=abc', origin: 'https://opos.land' }

    expect(
      await rateLimitTracker(verifier, env)(req('192.0.2.1', undefined, cookie), context),
    ).toBe(`account:${sub}`)
    expect(verifier.verify).toHaveBeenCalledWith('abc')
  })

  it('tracks a forged cookie by the address, never the account it names', async () => {
    const verifier = verifying({ status: 'invalid' })
    const cookie = { cookie: 'opos_panel_access=forged', origin: 'https://panel.opos.land' }

    expect(
      await rateLimitTracker(verifier, env)(req('192.0.2.1', undefined, cookie), context),
    ).toBe('ip:192.0.2.1')
  })

  it('tracks a request without a token by its address', async () => {
    const verifier = verifying({ status: 'invalid' })

    expect(await rateLimitTracker(verifier, env)(req('192.0.2.1'), context)).toBe('ip:192.0.2.1')
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('tracks a forged token by its address', async () => {
    const track = rateLimitTracker(verifying({ status: 'invalid' }), env)

    expect(await track(req('192.0.2.1', 'Bearer forged'), context)).toBe('ip:192.0.2.1')
  })

  it('counts against the address when verification is unavailable', async () => {
    const track = rateLimitTracker(verifying({ status: 'unavailable' }), env)

    expect(await track(req('192.0.2.1', 'Bearer abc'), context)).toBe('ip:192.0.2.1')
  })

  it('tracks an IPv6 address by its /64 network', async () => {
    const track = rateLimitTracker(verifying({ status: 'invalid' }), env)

    const one = await track(req('2001:db8:1:2::1'), context)
    const other = await track(req('2001:db8:1:2:ffff::9'), context)

    expect(one).toBe(other)
  })
})
