import { createHash, randomBytes } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ROUTE_RATE_LIMITS, RouteRateLimiter } from '../src/common/rate-limit/route-rate-limit'
import { authUrl, loadEnv } from '../src/config/env'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, mintToken, originOf } from './auth'
import { addVerifiedFactor, closeTenantDb } from './tenants'

// Google sign-in (PLAN.md 7.5) against the real API, with a stub standing in for Supabase Auth: no
// Google client exists locally, so the stub plays the authorize redirect and the PKCE exchange. It
// binds each code it issues to the S256 challenge of the redirect and refuses an exchange whose
// verifier does not hash to it, as Supabase Auth does. A call to anything else goes to the stack.

const env = loadEnv()
const auth = authUrl(env)
const portal = originOf('portal')
const panel = originOf('panel')
const realFetch = globalThis.fetch

let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>
let accountId: string
/** The level of the token the stub issues: the exchange of Google sign-in gives `aal1`. */
let issuedAal: 'aal1' | 'aal2' = 'aal1'

const challengeOf = (verifier: string) =>
  createHash('sha256').update(verifier).digest().toString('base64url')

/** What the stub knows: the challenge each code was issued for, and what the API sent to it. */
const issued = new Map<string, string>()
let exchanges: { auth_code: string; code_verifier: string }[] = []
let signUps: Record<string, unknown>[] = []

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function stubbedFetch(input: string | URL | Request, init?: RequestInit) {
  const url = input instanceof Request ? input.url : input.toString()
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
  if (url.startsWith(`${auth}/token?grant_type=pkce`)) {
    const { auth_code, code_verifier } = body as (typeof exchanges)[number]
    exchanges.push({ auth_code, code_verifier })
    const challenge = issued.get(auth_code)
    if (!challenge || challengeOf(code_verifier) !== challenge) {
      return jsonResponse(400, {
        code: 400,
        error_code: 'flow_state_not_found',
        msg: 'invalid flow state, no valid flow state found',
      })
    }
    issued.delete(auth_code)
    const now = Math.floor(Date.now() / 1000)
    return jsonResponse(200, {
      access_token: await mintToken({
        sub: accountId,
        providers: ['google'],
        aal: issuedAal,
        amr: [{ method: 'oauth', timestamp: now }],
        expiresIn: '1h',
      }),
      refresh_token: 'google-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: accountId,
        aud: 'authenticated',
        app_metadata: { providers: ['google'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    })
  }
  if (url.startsWith(`${auth}/signup`)) {
    signUps.push(body as Record<string, unknown>)
    return jsonResponse(200, { id: accountId, aud: 'authenticated', app_metadata: {} })
  }
  return realFetch(input, init)
}

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  server = app.getHttpServer()
  accountId = (await createAccount({ first_name: 'Anna' })).id
  vi.stubGlobal('fetch', vi.fn(stubbedFetch))
})

afterEach(() => {
  issuedAal = 'aal1'
  issued.clear()
  exchanges = []
  signUps = []
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  return header === undefined ? [] : [header].flat()
}
const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((cookie) => cookie.startsWith(`${name}=`))

interface GoogleCookie {
  verifier: string
  app: string
  path: string
  expiresAt: number
}

/** The `opos_google` cookie a response set, decoded. */
const readGoogleCookie = (res: request.Response) => {
  const raw = cookieNamed(res, 'opos_google')!.split(';')[0]!.split('=').slice(1).join('=')
  return JSON.parse(decodeURIComponent(raw)) as GoogleCookie
}

/** The `Cookie` header a browser would send back for a response's `opos_google`. */
const googleHeader = (res: request.Response) =>
  `opos_google=${cookieNamed(res, 'opos_google')!.split(';')[0]!.split('=').slice(1).join('=')}`

const start = (query: Record<string, string | undefined>) =>
  request(server).get('/auth/google').query(query)

/** Starts a sign-in and plays Supabase Auth and Google: a code bound to the redirect's challenge. */
async function startedFlow(app: 'portal' | 'panel' = 'panel', redirect?: string) {
  const res = await start({ app, redirect }).expect(302)
  const location = new URL(res.headers.location!)
  const code = randomBytes(8).toString('hex')
  issued.set(code, location.searchParams.get('code_challenge')!)
  return { res, location, code, cookie: googleHeader(res) }
}

const callback = (query: Record<string, string>, cookie?: string) => {
  const req = request(server).get('/auth/google/callback').query(query)
  return cookie ? req.set('Cookie', cookie) : req
}

describe('GET /auth/google', () => {
  it('redirects to authorize with an S256 challenge of the verifier it stored in opos_google', async () => {
    const { res, location } = await startedFlow()
    const { verifier } = readGoogleCookie(res)

    expect(location.origin + location.pathname).toBe(`${auth}/authorize`)
    expect(location.searchParams.get('provider')).toBe('google')
    expect(location.searchParams.get('code_challenge_method')).toMatch(/s256/i)
    expect(location.searchParams.get('code_challenge')).toBe(challengeOf(verifier))
    expect(location.searchParams.get('redirect_to')).toBe(`${env.API_URL}/auth/google/callback`)
  })

  it('sets opos_google HttpOnly, SameSite=Lax, Path=/auth/google, past the flow it holds', async () => {
    const { res } = await startedFlow('panel', '/invitation?token=abc')
    const cookie = cookieNamed(res, 'opos_google')!

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/auth/google')
    expect(cookie).toContain('Max-Age=3600')
    expect(cookie).not.toContain('Domain')
    expect(cookie.includes('Secure')).toBe(new URL(env.API_URL).protocol === 'https:')
    const stored = readGoogleCookie(res)
    expect(stored).toMatchObject({ app: 'panel', path: '/invitation?token=abc' })
    expect(stored.expiresAt).toBeGreaterThan(Date.now())
    expect(stored.expiresAt).toBeLessThanOrEqual(Date.now() + 600_000)
  })

  it('draws a new verifier for every start and sets no session cookie', async () => {
    const first = await startedFlow()
    const second = await startedFlow()

    expect(readGoogleCookie(first.res).verifier).not.toBe(readGoogleCookie(second.res).verifier)
    expect(cookiesOf(first.res)).toHaveLength(1)
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'takes the start page instead of the redirect %s',
    async (redirect) => {
      const { res } = await startedFlow('portal', redirect)

      expect(readGoogleCookie(res).path).toBe('/')
    },
  )

  it('takes the start page when there is no redirect', async () => {
    const { res } = await startedFlow('portal')

    expect(readGoogleCookie(res).path).toBe('/')
  })

  it.each([undefined, 'cms', 'PORTAL', ''])('refuses the application %j', async (application) => {
    const res = await start({ app: application }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(cookiesOf(res)).toEqual([])
  })

  it('spends the limit the five public auth routes share', async () => {
    const consume = vi.spyOn(RouteRateLimiter.prototype, 'consume')

    await startedFlow()

    expect(consume).toHaveBeenCalledWith('authentication', expect.stringMatching(/^ip:/))
  })

  it('needs no Origin and writes nothing of the verifier into the body', async () => {
    const res = await start({ app: 'portal' }).expect(302)

    expect(res.text).not.toContain(readGoogleCookie(res).verifier)
  })
})

// A navigation over a limit lands on a page; each case has an API and an address of its own, so its
// counters reach no other case.
describe('GET /auth/google over a limit', () => {
  const from = (api: NestExpressApplication, ip: string, query: Record<string, string>) =>
    request(api.getHttpServer()).get('/auth/google').query(query).set('X-Forwarded-For', ip)

  it('redirects to the login page of the application over the limit of the auth routes', async () => {
    const roomy = await createApp({}, [], { limit: 100_000, ttl: 60_000 })
    try {
      const ip = '198.51.100.21'
      const { limit } = ROUTE_RATE_LIMITS.authentication
      for (let spent = 0; spent < limit; spent += 25) {
        await Promise.all(
          Array.from({ length: 25 }, () => from(roomy, ip, { app: 'panel' }).expect(302)),
        )
      }

      const res = await from(roomy, ip, { app: 'panel' }).expect(302)

      expect(res.headers.location).toBe(`${panel}/login?error=auth.over_request_rate_limit`)
      expect(cookieNamed(res, 'opos_google')).toBeUndefined()
    } finally {
      await roomy.close()
    }
  }, 60_000)

  it.each([
    ['portal', portal],
    ['panel', panel],
  ])(
    'redirects to the login page of the %s over the default limit',
    async (application, origin) => {
      const tight = await createApp({}, [], { limit: 1, ttl: 60_000 })
      try {
        const ip = '198.51.100.22'
        await from(tight, ip, { app: application }).expect(302)

        const res = await from(tight, ip, { app: application }).expect(302)

        expect(res.headers.location).toBe(`${origin}/login?error=auth.over_request_rate_limit`)
        expect(cookieNamed(res, 'opos_google')).toBeUndefined()
      } finally {
        await tight.close()
      }
    },
  )

  it('answers 429 in the error shape to a query that names no application', async () => {
    const tight = await createApp({}, [], { limit: 1, ttl: 60_000 })
    try {
      const ip = '198.51.100.23'
      await from(tight, ip, {}).expect(400)

      const res = await from(tight, ip, {}).expect(429)

      expect(res.body).toMatchObject({ code: 'request.rate-limited' })
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    } finally {
      await tight.close()
    }
  })

  it('answers any other failure of the route as every route does', async () => {
    vi.spyOn(RouteRateLimiter.prototype, 'consume').mockRejectedValueOnce(new Error('broken'))
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const res = await start({ app: 'portal' }).expect(500)

    expect(res.body).toMatchObject({ code: 'server.error' })
  })
})

describe('GET /auth/google/callback', () => {
  it('sends the stored verifier when exchanging the code', async () => {
    const { res, code, cookie } = await startedFlow()

    await callback({ code }, cookie).expect(302)

    expect(exchanges).toEqual([{ auth_code: code, code_verifier: readGoogleCookie(res).verifier }])
  })

  it('sets the session cookies of the stored application and redirects to the stored path', async () => {
    const { code, cookie } = await startedFlow('panel', '/invitation?token=abc')

    const res = await callback({ code }, cookie).expect(302)

    expect(res.headers.location).toBe(`${panel}/invitation?token=abc`)
    expect(cookieNamed(res, 'opos_panel_access')).toContain('SameSite=Strict')
    expect(cookieNamed(res, 'opos_panel_refresh')).toContain('Path=/auth')
    expect(cookieNamed(res, 'opos_portal_access')).toBeUndefined()
    expect(cookieNamed(res, 'opos_portal_refresh')).toBeUndefined()
  })

  it('opens a session that GET /me answers with the account and its Google method', async () => {
    const { code, cookie } = await startedFlow('portal', '/account')
    const res = await callback({ code }, cookie).expect(302)
    expect(res.headers.location).toBe(`${portal}/account`)
    const access = cookieNamed(res, 'opos_portal_access')!.split(';')[0]!

    const me = await request(server).get('/me').set('Origin', portal).set('Cookie', access)

    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ id: accountId, signInMethods: ['google'] })
  })

  it('clears opos_google after the exchange, with the path it was set with', async () => {
    const { code, cookie } = await startedFlow()

    const res = await callback({ code }, cookie).expect(302)

    const cleared = cookieNamed(res, 'opos_google')!
    expect(cleared).toMatch(/^opos_google=;/)
    expect(cleared).toContain('Path=/auth/google')
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  describe('on an account with 2FA', () => {
    let plainAccountId: string

    beforeAll(async () => {
      plainAccountId = accountId
      accountId = (await createAccount()).id
      await addVerifiedFactor(accountId)
    })

    afterAll(() => {
      accountId = plainAccountId
    })

    it('leads to the code screen, keeping the path, with the aal1 cookies set', async () => {
      const { code, cookie } = await startedFlow('panel', '/editions?tab=1')

      const res = await callback({ code }, cookie).expect(302)

      expect(res.headers.location).toBe(`${panel}/auth/mfa?redirect=%2Feditions%3Ftab%3D1`)
      expect(cookieNamed(res, 'opos_panel_access')).toBeDefined()
      expect(cookieNamed(res, 'opos_panel_refresh')).toBeDefined()
      expect(cookieNamed(res, 'opos_portal_access')).toBeUndefined()
    })

    it('judges the path again before it goes into the redirect', async () => {
      const { code, cookie } = await startedFlow('portal', 'https://evil.example/x')

      const res = await callback({ code }, cookie).expect(302)

      expect(res.headers.location).toBe(`${portal}/auth/mfa?redirect=%2F`)
    })

    it('does not send a session that is already aal2 to the code screen', async () => {
      issuedAal = 'aal2'
      const { code, cookie } = await startedFlow('portal', '/account')

      const res = await callback({ code }, cookie).expect(302)

      expect(res.headers.location).toBe(`${portal}/account`)
    })
  })

  it('sends nothing of the verifier or the tokens in a body or a Location', async () => {
    const { res: started, code, cookie } = await startedFlow()

    const res = await callback({ code }, cookie).expect(302)

    const { verifier } = readGoogleCookie(started)
    expect(res.text).not.toContain(verifier)
    expect(res.headers.location).not.toContain(verifier)
    expect(res.headers.location).not.toContain(code)
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'takes the start page instead of the tampered redirect %s',
    async (path) => {
      const { res, code } = await startedFlow('portal')
      const tampered = { ...readGoogleCookie(res), path }
      const cookie = `opos_google=${encodeURIComponent(JSON.stringify(tampered))}`

      const result = await callback({ code }, cookie).expect(302)

      expect(result.headers.location).toBe(`${portal}/`)
    },
  )

  it('judges a tampered application again: one that is neither answers the portal login', async () => {
    const { res, code } = await startedFlow('portal')
    const tampered = { ...readGoogleCookie(res), app: 'https://evil.example' }
    const cookie = `opos_google=${encodeURIComponent(JSON.stringify(tampered))}`

    const result = await callback({ code }, cookie).expect(302)

    expect(result.headers.location).toBe(`${portal}/login?error=auth.google-failed`)
    expect(cookieNamed(result, 'opos_portal_access')).toBeUndefined()
    expect(exchanges).toEqual([])
  })

  it('without the cookie redirects to the portal login with auth.google-failed', async () => {
    const { code } = await startedFlow('panel')

    const res = await callback({ code }).expect(302)

    expect(res.headers.location).toBe(`${portal}/login?error=auth.google-failed`)
    expect(cookiesOf(res).filter((cookie) => cookie.includes('_access='))).toEqual([])
    expect(exchanges).toEqual([])
  })

  it('with another browser cookie signs nobody in', async () => {
    const mine = await startedFlow('panel')
    const theirs = await startedFlow('panel')

    // The code of one browser's flow arrives with the cookie of another browser's.
    const res = await callback({ code: mine.code }, theirs.cookie).expect(302)

    expect(res.headers.location).toBe(`${panel}/login?error=auth.google-failed`)
    expect(cookiesOf(res).filter((cookie) => cookie.includes('_access='))).toEqual([])
    expect(exchanges).toHaveLength(1)
    expect(cookieNamed(res, 'opos_google')).toMatch(/^opos_google=;/)
  })

  it('a code spent once signs nobody in the second time', async () => {
    const { code, cookie } = await startedFlow('panel')
    await callback({ code }, cookie).expect(302)

    const res = await callback({ code }, cookie).expect(302)

    expect(res.headers.location).toBe(`${panel}/login?error=auth.google-failed`)
    expect(cookieNamed(res, 'opos_panel_access')).toBeUndefined()
  })

  it('past 10 minutes signs nobody in and returns to the login of its own application', async () => {
    // An agent keeps the cookie as a browser does, and drops it once its lifetime has passed.
    const browser = request.agent(server)
    const started = await browser.get('/auth/google').query({ app: 'panel' }).expect(302)
    const code = randomBytes(8).toString('hex')
    issued.set(code, new URL(started.headers.location!).searchParams.get('code_challenge')!)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 601_000)

    const res = await browser.get('/auth/google/callback').query({ code }).expect(302)

    expect(res.headers.location).toBe(`${panel}/login?error=auth.google-failed`)
    expect(cookiesOf(res).filter((cookie) => cookie.includes('_access='))).toEqual([])
    expect(exchanges).toEqual([])
  })

  it.each([
    ['otp_expired', 'auth.otp_expired'],
    ['over_request_rate_limit', 'auth.over_request_rate_limit'],
    ['signup_disabled', 'auth.google-failed'],
    ['email_exists', 'auth.google-failed'],
    ['<script>', 'auth.google-failed'],
    [undefined, 'auth.google-failed'],
  ])(
    'with error_code %s from Supabase Auth redirects to the application login with %s',
    async (errorCode, expected) => {
      const { cookie } = await startedFlow('panel')
      const query: Record<string, string> = {
        error: 'access_denied',
        error_description: 'Access denied for a@b.test',
      }
      if (errorCode) query.error_code = errorCode

      const res = await callback(query, cookie).expect(302)

      expect(res.headers.location).toBe(`${panel}/login?error=${expected}`)
      expect(res.headers.location).not.toContain('a@b.test')
      expect(exchanges).toEqual([])
      expect(cookieNamed(res, 'opos_google')).toMatch(/^opos_google=;/)
    },
  )

  it('with neither a code nor an error redirects to the application login', async () => {
    const { cookie } = await startedFlow('portal')

    const res = await callback({}, cookie).expect(302)

    expect(res.headers.location).toBe(`${portal}/login?error=auth.google-failed`)
  })

  it('answers a failed exchange the same way for any reason Supabase Auth gives', async () => {
    const { cookie } = await startedFlow('panel')

    const res = await callback({ code: 'never-issued' }, cookie).expect(302)

    expect(res.headers.location).toBe(`${panel}/login?error=auth.google-failed`)
  })

  it('logs the code and status of a failed exchange, and nothing the flow keeps secret', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const started = await startedFlow('panel')
    const { verifier } = readGoogleCookie(started.res)

    await callback({ code: 'never-issued-code' }, started.cookie).expect(302)

    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('flow_state_not_found')
    expect(logged).toContain('400')
    expect(logged).not.toContain(verifier)
    expect(logged).not.toContain('never-issued-code')
  })

  it('logs the error_code Supabase Auth sent, and not what else the query holds', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { cookie } = await startedFlow('panel')

    await callback(
      {
        error: 'server_error',
        error_code: 'unexpected_failure',
        error_description: 'Denied for a@b.test',
      },
      cookie,
    ).expect(302)

    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('unexpected_failure')
    expect(logged).not.toContain('a@b.test')
  })

  it('answers a session of an account the API has no row for with the failure', async () => {
    const { code, cookie } = await startedFlow('panel')
    const gone = accountId
    accountId = '00000000-0000-4000-8000-000000000000'

    const res = await callback({ code }, cookie).expect(302)
    accountId = gone

    expect(res.headers.location).toBe(`${panel}/login?error=auth.google-failed`)
    expect(cookieNamed(res, 'opos_panel_access')).toBeUndefined()
  })
})

describe('the other sign-in routes', () => {
  it('use the implicit client: a sign-up carries no PKCE challenge', async () => {
    await startedFlow()

    await request(server)
      .post('/auth/sign-up')
      .set('Origin', portal)
      .send({ email: 'someone@example.test' })
      .expect(202)

    expect(signUps).toHaveLength(1)
    expect(signUps[0]).toMatchObject({ code_challenge: null })
  })
})
