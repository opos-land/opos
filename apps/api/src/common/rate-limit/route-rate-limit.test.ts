import { ThrottlerStorageService } from '@nestjs/throttler'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS, RouteRateLimiter } from './route-rate-limit'

const storages: ThrottlerStorageService[] = []
afterEach(() => {
  for (const storage of storages.splice(0)) storage.onApplicationShutdown()
})

const limiter = () => {
  const storage = new ThrottlerStorageService()
  storages.push(storage)
  return new RouteRateLimiter(storage)
}

const refusal = async (spend: () => Promise<void>) => {
  try {
    await spend()
    return undefined
  } catch (error) {
    return error as { code: string; getStatus(): number; headers?: Record<string, string> }
  }
}

describe('RouteRateLimiter', () => {
  it('lets a tracker spend its limit, then answers 429 with Retry-After', async () => {
    const rateLimiter = limiter()
    const { limit, ttl } = ROUTE_RATE_LIMITS.invitationPreview

    for (let i = 0; i < limit; i++) await rateLimiter.consume('invitationPreview', 'ip:192.0.2.1')
    const error = await refusal(() => rateLimiter.consume('invitationPreview', 'ip:192.0.2.1'))

    expect(error?.getStatus()).toBe(429)
    expect(error?.code).toBe('request.rate-limited')
    const retryAfter = Number(error?.headers?.['Retry-After'])
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(ttl / 1000)
  })

  it('keeps one counter per limit and tracker', async () => {
    const rateLimiter = limiter()
    for (let i = 0; i < ROUTE_RATE_LIMITS.invitations.limit; i++) {
      await rateLimiter.consume('invitations', 'tenant:a')
    }

    expect(await refusal(() => rateLimiter.consume('invitations', 'tenant:b'))).toBeUndefined()
    expect(
      await refusal(() => rateLimiter.consume('invitationPreview', 'tenant:a')),
    ).toBeUndefined()
    expect((await refusal(() => rateLimiter.consume('invitations', 'tenant:a')))?.code).toBe(
      'request.rate-limited',
    )
  })

  it('sets the limits of PLAN.md 7.9', () => {
    expect(ROUTE_RATE_LIMITS).toEqual({
      invitations: { limit: 20, ttl: 3_600_000 },
      invitationPreview: { limit: 30, ttl: 3_600_000 },
    })
  })
})
