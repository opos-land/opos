import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_RATE_LIMIT } from '../src/common/rate-limit/rate-limit'
import { createApp } from './app'
import {
  createAccount,
  deleteCreatedAccounts,
  enableMfa,
  foreignKey,
  mintToken,
  originOf,
  session,
  signIn,
  TEST_PASSWORD,
} from './auth'

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
  return token ? req.use(session(token)) : req
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

  it('counts a signed-in request against the session, not the address', async () => {
    const one = await createAccount()
    const other = await createAccount()
    const [oneToken, otherToken] = await Promise.all([signIn(one.email), signIn(other.email)])

    await spend(LIMIT, '/me', '203.0.113.10', oneToken)

    expectLimited(await get('/me', '203.0.113.11', oneToken))
    await get('/me', '203.0.113.10', otherToken).expect(200)
    await get('/health', '203.0.113.10').expect(200)
  })

  it('keeps the limit of each session of one account to itself', async () => {
    const { email } = await createAccount()
    const [one, other] = await Promise.all([signIn(email), signIn(email)])

    await spend(LIMIT, '/me', '203.0.113.12', one)

    expectLimited(await get('/me', '203.0.113.12', one))
    await get('/me', '203.0.113.13', other).expect(200)
  })

  it('leaves the aal2 session of an account alone while a password spends its aal1 limit', async () => {
    const { email } = await createAccount()
    const browser = () => request.agent(app.getHttpServer()).set('Origin', originOf('portal'))
    const owner = browser()
    await owner.post('/auth/sign-in').send({ email, password: TEST_PASSWORD }).expect(200)
    await enableMfa(owner)
    const passwordHolder = browser()
    const signedIn = await passwordHolder
      .post('/auth/sign-in')
      .set('X-Forwarded-For', '203.0.113.14')
      .send({ email, password: TEST_PASSWORD })
    expect(signedIn.body).toMatchObject({ code: 'session.mfa-required' })

    for (let i = 0; i < LIMIT; i++) await passwordHolder.get('/me').expect(401)

    expectLimited(await passwordHolder.get('/me'))
    await owner.get('/me').expect(200)
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
    const forged = await mintToken({ sub: victim.id }, await foreignKey())

    for (let i = 0; i < LIMIT; i++) await get('/me', '203.0.113.30', forged).expect(401)

    expectLimited(await get('/me', '203.0.113.30', forged))
    await get('/me', '203.0.113.31', await signIn(victim.email)).expect(200)
  })

  it('counts a token that cannot be checked against the address', async () => {
    const victim = await createAccount()
    const token = await signIn(victim.email)
    const cut = await createApp({ SUPABASE_URL: 'http://127.0.0.1:1' }, [], {
      limit: LIMIT,
      ttl: 60_000,
    })
    await cut.listen(0, '127.0.0.1')
    const call = (ip: string) =>
      request(cut.getHttpServer()).get('/me').set('X-Forwarded-For', ip).use(session(token))
    try {
      for (let i = 0; i < LIMIT; i++) await call('203.0.113.40').expect(503)

      expectLimited(await call('203.0.113.40'))
      await call('203.0.113.41').expect(503)
    } finally {
      await cut.close()
    }
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
