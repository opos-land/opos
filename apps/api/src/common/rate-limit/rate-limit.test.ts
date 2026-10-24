import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { accessTokenKey } from '../guards/access-token'
import { rateLimitTracker } from './rate-limit'

const key = accessTokenKey({ JWT_SECRET: 'x'.repeat(32), AUTH_URL: 'http://auth.test' })
const track = rateLimitTracker(key)
const context = {} as ExecutionContext

const token = (sub: string, secret = key.key) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuer('http://auth.test')
    .setExpirationTime('5m')
    .sign(secret)

const req = (ip: string, authorization?: string) => ({
  ip,
  headers: authorization ? { authorization } : {},
})

describe('rateLimitTracker', () => {
  it('tracks a valid token by its account', async () => {
    const sub = randomUUID()

    expect(await track(req('192.0.2.1', `Bearer ${await token(sub)}`), context)).toBe(
      `account:${sub}`,
    )
  })

  it('tracks a request without a token by its address', async () => {
    expect(await track(req('192.0.2.1'), context)).toBe('ip:192.0.2.1')
  })

  it('tracks a forged token by its address', async () => {
    const forged = await token(randomUUID(), new TextEncoder().encode('y'.repeat(32)))

    expect(await track(req('192.0.2.1', `Bearer ${forged}`), context)).toBe('ip:192.0.2.1')
  })

  it('tracks an IPv6 address by its /64 network', async () => {
    const one = await track(req('2001:db8:1:2::1'), context)
    const other = await track(req('2001:db8:1:2:ffff::9'), context)

    expect(one).toBe(other)
  })
})
