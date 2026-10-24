import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_RATE_LIMIT } from '../src/common/rate-limit/rate-limit'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, mintToken, signIn } from './auth'

// Every case sends its own X-Forwarded-For address, so the counters of one case never reach
// another; `trust proxy` makes that header the client address (PLAN.md 7.9).

let app: NestExpressApplication

const LIMIT = 3

beforeAll(async () => {
  app = await createApp({}, [], { limit: LIMIT, ttl: 60_000 })
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await app.close()
})

const get = (path: string, ip: string, token?: string) => {
  const req = request(app.getHttpServer()).get(path).set('X-Forwarded-For', ip)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

const spend = async (count: number, path: string, ip: string, token?: string) => {
  for (let i = 0; i < count; i++) await get(path, ip, token)
}

const expectLimited = (res: request.Response) => {
  expect(res.status).toBe(429)
  expect(res.body).toMatchObject({ code: 'request.rate-limited' })
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
}

describe('rate limit', () => {
  it('answers 429 with Retry-After once an address spends its limit', async () => {
    await spend(LIMIT, '/health', '203.0.113.1')

    expectLimited(await get('/health', '203.0.113.1'))
    await get('/health', '203.0.113.2').expect(200)
  })

  it('counts a signed-in request against the account, not the address', async () => {
    const one = await createAccount()
    const other = await createAccount()
    const [oneToken, otherToken] = await Promise.all([signIn(one.email), signIn(other.email)])

    await spend(LIMIT, '/me', '203.0.113.10', oneToken)

    expectLimited(await get('/me', '203.0.113.11', oneToken))
    await get('/me', '203.0.113.10', otherToken).expect(200)
    await get('/health', '203.0.113.10').expect(200)
  })

  it('shares one counter between every route', async () => {
    const account = await createAccount()
    const token = await signIn(account.email)

    await get('/me', '203.0.113.20', token).expect(200)
    await get('/me/memberships', '203.0.113.20', token).expect(200)
    await get('/health', '203.0.113.20', token).expect(200)

    expectLimited(await get('/me/memberships', '203.0.113.20', token))
  })

  it('counts a forged token against the address, never against the account it names', async () => {
    const victim = await createAccount()
    const forged = await mintToken({ sub: victim.id }, new TextEncoder().encode('x'.repeat(32)))

    for (let i = 0; i < LIMIT; i++) await get('/me', '203.0.113.30', forged).expect(401)

    expectLimited(await get('/me', '203.0.113.30', forged))
    await get('/me', '203.0.113.31', await signIn(victim.email)).expect(200)
  })
})

describe('the default rate limit', () => {
  let defaults: NestExpressApplication

  beforeAll(async () => {
    defaults = await createApp()
    await defaults.listen(0, '127.0.0.1')
  })

  afterAll(async () => {
    await defaults.close()
  })

  it('allows 300 requests a minute per address', async () => {
    expect(DEFAULT_RATE_LIMIT).toEqual({ limit: 300, ttl: 60_000 })
    const send = () =>
      request(defaults.getHttpServer()).get('/health').set('X-Forwarded-For', '198.51.100.7')

    for (let batch = 0; batch < DEFAULT_RATE_LIMIT.limit / 50; batch++) {
      const responses = await Promise.all(Array.from({ length: 50 }, send))
      expect(responses.every((res) => res.status === 200)).toBe(true)
    }

    expectLimited(await send())
  })
})
