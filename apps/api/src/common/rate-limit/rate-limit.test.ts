import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { type AccessTokenVerifier, type TokenCheck } from '../guards/access-token'
import { rateLimitTracker } from './rate-limit'

/** A verifier that gives every token the same outcome. */
const verifying = (check: TokenCheck) => ({
  verify: vi.fn<AccessTokenVerifier['verify']>(() => Promise.resolve(check)),
  close: vi.fn(),
})

const context = {} as ExecutionContext

const req = (ip: string, authorization?: string) => ({
  ip,
  headers: authorization ? { authorization } : {},
})

describe('rateLimitTracker', () => {
  it('counts a valid token against the account', async () => {
    const sub = randomUUID()
    const verifier = verifying({ status: 'valid', payload: { sub } })

    expect(await rateLimitTracker(verifier)(req('192.0.2.1', 'Bearer abc'), context)).toBe(
      `account:${sub}`,
    )
    expect(verifier.verify).toHaveBeenCalledWith('abc')
  })

  it('tracks a request without a token by its address', async () => {
    const verifier = verifying({ status: 'invalid' })

    expect(await rateLimitTracker(verifier)(req('192.0.2.1'), context)).toBe('ip:192.0.2.1')
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('tracks a forged token by its address', async () => {
    const track = rateLimitTracker(verifying({ status: 'invalid' }))

    expect(await track(req('192.0.2.1', 'Bearer forged'), context)).toBe('ip:192.0.2.1')
  })

  it('counts against the address when verification is unavailable', async () => {
    const track = rateLimitTracker(verifying({ status: 'unavailable' }))

    expect(await track(req('192.0.2.1', 'Bearer abc'), context)).toBe('ip:192.0.2.1')
  })

  it('tracks an IPv6 address by its /64 network', async () => {
    const track = rateLimitTracker(verifying({ status: 'invalid' }))

    const one = await track(req('2001:db8:1:2::1'), context)
    const other = await track(req('2001:db8:1:2:ffff::9'), context)

    expect(one).toBe(other)
  })
})
