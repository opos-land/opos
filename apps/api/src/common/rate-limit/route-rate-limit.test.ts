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

  it('refuses a blocked tracker by a check, which spends nothing', async () => {
    const rateLimiter = limiter()
    const { limit, ttl } = ROUTE_RATE_LIMITS.discountCodeTries
    const check = (tracker: string) =>
      refusal(() => Promise.resolve(rateLimiter.check('discountCodeTries', tracker)))

    for (let i = 0; i < limit * 2; i++) expect(await check('ip:192.0.2.1')).toBeUndefined()
    for (let i = 0; i < limit; i++) await rateLimiter.consume('discountCodeTries', 'ip:192.0.2.1')
    expect(await check('ip:192.0.2.1')).toBeUndefined()
    await refusal(() => rateLimiter.consume('discountCodeTries', 'ip:192.0.2.1'))
    const error = await check('ip:192.0.2.1')

    expect(error?.getStatus()).toBe(429)
    expect(error?.code).toBe('request.rate-limited')
    const retryAfter = Number(error?.headers?.['Retry-After'])
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(ttl / 1000)
    expect(await check('ip:192.0.2.2')).toBeUndefined()
  })

  // A request counted once it was answered: none is left to refuse when the limit is reached.
  it('refuses nothing by a spend, and blocks the tracker that spends the last of its limit', async () => {
    const rateLimiter = limiter()
    const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
    const check = () =>
      refusal(() => Promise.resolve(rateLimiter.check('discountCodeTries', 'ip:192.0.2.1')))

    for (let i = 1; i < limit; i++) {
      expect(
        await refusal(() => rateLimiter.spend('discountCodeTries', 'ip:192.0.2.1')),
      ).toBeUndefined()
    }
    expect(await check()).toBeUndefined()
    expect(
      await refusal(() => rateLimiter.spend('discountCodeTries', 'ip:192.0.2.1')),
    ).toBeUndefined()

    expect((await check())?.code).toBe('request.rate-limited')
    expect(
      (await refusal(() => rateLimiter.consume('discountCodeTries', 'ip:192.0.2.1')))?.code,
    ).toBe('request.rate-limited')
    // Blocked already, a spend is still refused nothing.
    expect(
      await refusal(() => rateLimiter.spend('discountCodeTries', 'ip:192.0.2.1')),
    ).toBeUndefined()
  })

  describe('a request counted only when it fails', () => {
    const failure = new Error('refused')
    const failed = (error: unknown) => error === failure
    const fails = () => Promise.reject(failure)
    const settled = (request: Promise<unknown>) =>
      request.then(
        () => 'answered',
        (error: unknown) => (error === failure ? 'failed' : (error as { code: string }).code),
      )

    it('spends nothing when it is answered, and one request when it fails', async () => {
      const rateLimiter = limiter()
      const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
      const counting = (request: () => Promise<unknown>) =>
        settled(rateLimiter.counting('discountCodeTries', 'ip:192.0.2.1', request, failed))

      for (let i = 0; i < limit * 2; i++) {
        expect(await counting(() => Promise.resolve('placed'))).toBe('answered')
      }
      // Another failure than the one counted spends nothing either.
      const other = new Error('sold out')
      await expect(
        rateLimiter.counting(
          'discountCodeTries',
          'ip:192.0.2.1',
          () => Promise.reject(other),
          failed,
        ),
      ).rejects.toBe(other)
      for (let i = 0; i < limit; i++) expect(await counting(fails)).toBe('failed')

      expect(await counting(fails)).toBe('request.rate-limited')
      expect(await counting(() => Promise.resolve('placed'))).toBe('request.rate-limited')
      expect(
        await settled(rateLimiter.counting('discountCodeTries', 'ip:192.0.2.2', fails, failed)),
      ).toBe('failed')
    })

    // Sent together, none of them is counted before the last one starts: no more of them run
    // than the tracker has requests left.
    it('runs at once no more requests than the tracker has left', async () => {
      const rateLimiter = limiter()
      const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
      let ran = 0
      const slow = async () => {
        ran += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw failure
      }

      const outcomes = await Promise.all(
        Array.from({ length: limit + 10 }, () =>
          settled(rateLimiter.counting('discountCodeTries', 'ip:192.0.2.1', slow, failed)),
        ),
      )

      expect(ran).toBe(limit)
      expect(outcomes.filter((outcome) => outcome === 'failed')).toHaveLength(limit)
      expect(outcomes.filter((outcome) => outcome === 'request.rate-limited')).toHaveLength(10)
      // Counted now, the tracker is blocked as one that spent its limit.
      expect(
        (await refusal(() => rateLimiter.consume('discountCodeTries', 'ip:192.0.2.1')))?.code,
      ).toBe('request.rate-limited')
    })

    it('counts beside the requests that spend at once, and lets one run where none is left', async () => {
      const rateLimiter = limiter()
      const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
      for (let i = 0; i < limit; i++) await rateLimiter.consume('discountCodeTries', 'ip:192.0.2.1')
      let ran = 0
      const slow = async () => {
        ran += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        return 'placed'
      }

      const outcomes = await Promise.all(
        Array.from({ length: 3 }, () =>
          settled(rateLimiter.counting('discountCodeTries', 'ip:192.0.2.1', slow, failed)),
        ),
      )

      expect(ran).toBe(1)
      expect(outcomes).toEqual(['answered', 'request.rate-limited', 'request.rate-limited'])
      // What ran is held no longer: the next one runs.
      expect(
        await settled(rateLimiter.counting('discountCodeTries', 'ip:192.0.2.1', slow, failed)),
      ).toBe('answered')
    })
  })

  it('sets the route limits', () => {
    expect(ROUTE_RATE_LIMITS).toEqual({
      authentication: { limit: 300, ttl: 300_000 },
      invitations: { limit: 20, ttl: 3_600_000 },
      invitationPreview: { limit: 30, ttl: 3_600_000 },
      speakers: { limit: 100, ttl: 3_600_000 },
      mfa: { limit: 10, ttl: 900_000 },
      adminWrites: { limit: 60, ttl: 3_600_000 },
      uploads: { limit: 120, ttl: 3_600_000 },
      providerConnects: { limit: 20, ttl: 3_600_000 },
      shopQuotes: { limit: 600, ttl: 3_600_000 },
      orderPlacements: { limit: 300, ttl: 3_600_000 },
      paymentAttempts: { limit: 300, ttl: 3_600_000 },
      paymentAttemptsOfOrder: { limit: 20, ttl: 3_600_000 },
      confirmationResends: { limit: 5, ttl: 3_600_000 },
      discountCodeTries: { limit: 30, ttl: 3_600_000 },
      salesExports: { limit: 30, ttl: 3_600_000 },
      orderLinkOpens: { limit: 60, ttl: 3_600_000 },
      orderLinkOpensOfLink: { limit: 120, ttl: 3_600_000 },
      orderLinkRenewals: { limit: 10, ttl: 3_600_000 },
      scannerPairings: { limit: 30, ttl: 3_600_000 },
      scannerScans: { limit: 6000, ttl: 3_600_000 },
      scannerHandOuts: { limit: 6000, ttl: 3_600_000 },
      scannerRefusals: { limit: 300, ttl: 3_600_000 },
      profileReports: { limit: 10, ttl: 3_600_000 },
    })
  })
})
