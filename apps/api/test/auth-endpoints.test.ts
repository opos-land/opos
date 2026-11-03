import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { Logger } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authUrl, loadEnv } from '../src/config/env'
import { createApp } from './app'
import {
  bindApi,
  createAccount,
  deleteCreatedAccounts,
  deleteLater,
  foreignKey,
  mintToken,
  originOf,
  signedInAgent,
  signIn,
  TEST_PASSWORD,
  testEmail,
} from './auth'
import { HOOK_PORT_TIMEOUT_MS, listenOnHookPort } from './hook-port'
import { confirmLinkIn, deleteMail, waitForMail } from './mailpit'
import { accountByEmail, closeTenantDb } from './tenants'

// Every operation of PLAN.md 5.1 against the local stack, from real cookies (PLAN.md 15.1). The
// sign-ups here make Supabase Auth call the send-email hook, so the API listens on its PORT.

const env = loadEnv()
const portal = originOf('portal')
const panel = originOf('panel')
const addresses: string[] = []
let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>

beforeAll(async () => {
  app = await createApp()
  await listenOnHookPort(app, env.PORT)
  server = app.getHttpServer()
  bindApi(server)
}, HOOK_PORT_TIMEOUT_MS)

afterAll(async () => {
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await app.close()
})

const newAddress = () => {
  const address = testEmail('auth')
  addresses.push(address)
  return address
}

/** An account that exists and is confirmed; its address is cleaned from Mailpit afterwards. */
const confirmedAccount = async (metadata: Record<string, string> = {}) => {
  const account = await createAccount(metadata)
  addresses.push(account.email)
  return account
}

const post = (path: string, body?: object, origin: string | null = portal) => {
  const req = request(server).post(path)
  return (origin ? req.set('Origin', origin) : req).send(body ?? {})
}

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  return header === undefined ? [] : [header].flat()
}

const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((cookie) => cookie.startsWith(`${name}=`))

/** Both cookies of `application` expired by this response, and no other cookie touched. */
const expectCleared = (res: request.Response, application: 'portal' | 'panel') => {
  expect(
    cookiesOf(res)
      .map((cookie) => cookie.split('=')[0])
      .sort(),
  ).toEqual([`opos_${application}_access`, `opos_${application}_refresh`])
  for (const cookie of cookiesOf(res)) {
    expect(cookie).toMatch(/^[^=]+=;/)
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/)
  }
}

const valueOf = (cookie: string | undefined) => cookie?.split(';')[0]?.split('=').slice(1).join('=')

/** The token hash and type of the newest confirmation email to `address`; Mailpit lists it first. */
async function linkFor(address: string, count = 1) {
  const mails = await waitForMail(address, count)
  const link = confirmLinkIn(mails[0]!)
  return {
    tokenHash: link.searchParams.get('token_hash')!,
    type: link.searchParams.get('type')!,
    origin: link.origin,
  }
}

/** An API whose Supabase Auth answers every call with `status` and `body`; the stub closes both. */
async function stubbedSupabaseAuth(status: number, body: object) {
  const stub = createServer((_, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`
  const stubbed = await createApp({ SUPABASE_URL: url })
  return {
    app: stubbed,
    close: async () => {
      await stubbed.close()
      stub.close()
    },
  }
}

/** An API whose Supabase Auth is the real one, except that changing a user fails. */
async function failingUserUpdate() {
  const real = authUrl(env).replace(/\/auth\/v1$/, '')
  const proxy = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      void (async () => {
        if (req.method === 'PUT' && req.url?.startsWith('/auth/v1/user')) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error_code: 'something_new', msg: 'refused' }))
          return
        }
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(
            ([name]) => !['host', 'content-length'].includes(name),
          ),
        ) as Record<string, string>
        const upstream = await fetch(`${real}${req.url}`, {
          method: req.method,
          headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        })
        res.writeHead(upstream.status, { 'content-type': 'application/json' })
        res.end(Buffer.from(await upstream.arrayBuffer()))
      })()
    })
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
  const app = await createApp({ SUPABASE_URL: url })
  return {
    app,
    close: async () => {
      await app.close()
      proxy.close()
    },
  }
}

describe('sign-up', () => {
  it('answers 202 for a new and for a registered address alike, and takes no password', async () => {
    const address = newAddress()

    const first = await post('/auth/sign-up', { email: address, firstName: 'Anna' })
    const confirmed = await confirmedAccount()
    const registered = await post('/auth/sign-up', { email: confirmed.email })

    for (const res of [first, registered]) {
      expect(res.status).toBe(202)
      expect(res.text).toBe('')
      expect(cookiesOf(res)).toEqual([])
    }
    const account = await accountByEmail(address)
    deleteLater(account!.id)
    expect(account).toMatchObject({ firstName: 'Anna' })
  })

  it('stores the names and the locale detected from Accept-Language', async () => {
    const address = newAddress()

    await post('/auth/sign-up', { email: address, firstName: 'Anna', lastName: 'Nowak' })
      .set('Accept-Language', 'pl-PL,pl;q=0.9,en;q=0.5')
      .expect(202)

    const account = await accountByEmail(address)
    deleteLater(account!.id)
    expect(account).toMatchObject({ firstName: 'Anna', lastName: 'Nowak', locale: 'pl' })
  })

  it('rejects any password field with 400', async () => {
    const res = await post('/auth/sign-up', { email: newAddress(), password: 'secret-pass-1' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'password' } })
  })

  it('sends the confirmation link to the application that asked', async () => {
    const forPortal = newAddress()
    const forPanel = newAddress()

    await post('/auth/sign-up', { email: forPortal }, portal).expect(202)
    await post('/auth/sign-up', { email: forPanel }, panel).expect(202)

    expect((await linkFor(forPortal)).origin).toBe(portal)
    expect((await linkFor(forPanel)).origin).toBe(panel)
    for (const address of [forPortal, forPanel]) {
      deleteLater((await accountByEmail(address))!.id)
    }
  })
})

describe('resend and forgot', () => {
  it('answers 202 for any address, and mails a known one only', async () => {
    const known = await confirmedAccount()
    const unknown = newAddress()

    const forgotten = await post('/auth/password/forgot', { email: known.email })
    const unknownForgotten = await post('/auth/password/forgot', { email: unknown })
    const resent = await post('/auth/resend', { email: unknown })

    for (const res of [forgotten, unknownForgotten, resent]) {
      expect(res.status).toBe(202)
      expect(res.text).toBe('')
    }
    expect((await linkFor(known.email)).type).toBe('recovery')
  })
})

describe('a malformed address', () => {
  const routes = ['/auth/sign-up', '/auth/resend', '/auth/password/forgot']

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(
    routes.flatMap((route) =>
      ['not-an-email', `${'x'.repeat(300)}@example.test`].map((email) => [
        route,
        email.slice(0, 20),
        email,
      ]),
    ),
  )('answers 400 request.invalid on %s for %s, without a logged error', async (route, _, email) => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const res = await post(route, { email })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'email' } })
    expect(logged).not.toHaveBeenCalled()
  })

  it('answers auth.email_address_invalid when Supabase Auth still answers validation_failed', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const stub = await stubbedSupabaseAuth(400, { error_code: 'validation_failed', msg: 'nope' })
    try {
      for (const route of routes) {
        const res = await request(stub.app.getHttpServer())
          .post(route)
          .set('Origin', portal)
          .send({ email: 'anna@example.test' })

        expect(res.status).toBe(422)
        expect(res.body).toMatchObject({ code: 'auth.email_address_invalid' })
      }
      expect(logged).not.toHaveBeenCalled()
    } finally {
      await stub.close()
    }
  })

  it('counts the bytes of a new password: 72 of them pass, 74 are a 400', async () => {
    const { email } = await confirmedAccount()
    const caller = await signedInAgent('portal', email)

    const tooLong = await caller.put('/auth/password').send({ password: 'ą'.repeat(37) })
    const fits = await caller.put('/auth/password').send({ password: 'ą'.repeat(36) })

    expect(tooLong.status).toBe(400)
    expect(tooLong.body).toMatchObject({ code: 'request.invalid', params: { field: 'password' } })
    expect(fits.status).toBe(204)
    await post('/auth/sign-in', { email, password: 'ą'.repeat(36) }).expect(200)
  })
})

describe('the mail routes and the mail rate limit', () => {
  const routes = ['/auth/sign-up', '/auth/resend', '/auth/password/forgot']

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(routes)(
    'answers %s alike for a known and an unknown address, however often it is called',
    async (route) => {
      const known = await confirmedAccount()
      const unknown = newAddress()

      const statuses = []
      for (const email of [known.email, unknown]) {
        for (let call = 0; call < 3; call++) {
          statuses.push((await post(route, { email })).status)
        }
      }

      expect(statuses).toEqual([202, 202, 202, 202, 202, 202])
      const unknownAccount = await accountByEmail(unknown)
      if (unknownAccount) deleteLater(unknownAccount.id)
    },
  )

  it.each(routes)(
    'answers 202 on %s when Supabase Auth has no mail left, and logs a warning naming nobody',
    async (route) => {
      const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      const stub = await stubbedSupabaseAuth(429, {
        error_code: 'over_email_send_rate_limit',
        msg: 'email rate limit exceeded',
      })
      try {
        const res = await request(stub.app.getHttpServer())
          .post(route)
          .set('Origin', portal)
          .send({ email: 'anna.secret@example.test' })

        expect(res.status).toBe(202)
        expect(res.text).toBe('')
        expect(warned).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(warned.mock.calls)).not.toMatch(/anna|secret|example/)
        expect(logged).not.toHaveBeenCalled()
      } finally {
        await stub.close()
      }
    },
  )
})

describe('verify', () => {
  it('sets the pair of the calling application and answers the account', async () => {
    const address = newAddress()
    await post('/auth/sign-up', { email: address, firstName: 'Ola' }).expect(202)
    const { tokenHash, type } = await linkFor(address)

    const res = await post('/auth/verify', { tokenHash, type })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ email: address, firstName: 'Ola' })
    deleteLater((res.body as { id: string }).id)
    expect(cookieNamed(res, 'opos_portal_access')).toBeDefined()
    expect(cookieNamed(res, 'opos_portal_refresh')).toBeDefined()
    expect(cookieNamed(res, 'opos_panel_access')).toBeUndefined()
  })

  it('answers auth.otp_expired on a second use', async () => {
    const address = newAddress()
    await post('/auth/sign-up', { email: address }).expect(202)
    const { tokenHash, type } = await linkFor(address)
    const first = await post('/auth/verify', { tokenHash, type }).expect(200)
    deleteLater((first.body as { id: string }).id)

    const again = await post('/auth/verify', { tokenHash, type })

    expect(again.status).toBe(403)
    expect(again.body).toMatchObject({ code: 'auth.otp_expired' })
    expect(again.body).not.toHaveProperty(
      'message',
      expect.stringMatching(/expired or is invalid/i),
    )
    expect(cookiesOf(again)).toEqual([])
  })

  it('refuses a type other than signup and recovery', async () => {
    const res = await post('/auth/verify', { tokenHash: 'h', type: 'email_change' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'type' } })
  })
})

describe('sign-in', () => {
  it('sets HttpOnly, SameSite=Strict cookies with the documented paths and no Domain', async () => {
    const { email } = await confirmedAccount()

    const res = await post('/auth/sign-in', { email, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ email })
    const access = cookieNamed(res, 'opos_portal_access')!
    const refresh = cookieNamed(res, 'opos_portal_refresh')!
    expect(access).toMatch(/; Path=\/;/)
    expect(refresh).toMatch(/; Path=\/auth;/)
    for (const cookie of [access, refresh]) {
      expect(cookie).toMatch(/; HttpOnly/)
      expect(cookie).toMatch(/; SameSite=Strict/)
      expect(cookie).not.toMatch(/Domain=/i)
      expect(cookie).not.toMatch(/; Secure/)
    }
    expect(access).toMatch(/Max-Age=(8\d\d|9[01]\d|900)/)
    expect(refresh).toMatch(/Max-Age=2592000/)
  })

  it('marks the cookies Secure when API_URL is https', async () => {
    const secure = await createApp({ API_URL: 'https://api.opos.land' })
    try {
      const { email } = await confirmedAccount()

      const res = await request(secure.getHttpServer())
        .post('/auth/sign-in')
        .set('Origin', portal)
        .send({ email, password: TEST_PASSWORD })

      expect(res.status).toBe(200)
      expect(cookiesOf(res)).toHaveLength(2)
      for (const cookie of cookiesOf(res)) expect(cookie).toMatch(/; Secure/)
    } finally {
      await secure.close()
    }
  })

  it('sets only the panel pair for the panel Origin', async () => {
    const { email } = await confirmedAccount()

    const res = await post('/auth/sign-in', { email, password: TEST_PASSWORD }, panel)

    expect(res.status).toBe(200)
    expect(
      cookiesOf(res)
        .map((cookie) => cookie.split('=')[0])
        .sort(),
    ).toEqual(['opos_panel_access', 'opos_panel_refresh'])
  })

  it('returns no token anywhere in the body', async () => {
    const { email } = await confirmedAccount()

    const res = await post('/auth/sign-in', { email, password: TEST_PASSWORD })

    const access = valueOf(cookieNamed(res, 'opos_portal_access'))!
    const refresh = valueOf(cookieNamed(res, 'opos_portal_refresh'))!
    const everything = JSON.stringify([res.body, res.text, { ...res.headers, 'set-cookie': [] }])
    expect(everything).not.toContain(access)
    expect(everything).not.toContain(refresh)
    expect(everything).not.toMatch(/access_token|refresh_token/)
  })

  it('passes on auth.email_not_confirmed and auth.invalid_credentials, in words of its own', async () => {
    const unconfirmed = await createAccount({}, { confirmed: false })
    const confirmed = await confirmedAccount()

    const notConfirmed = await post('/auth/sign-in', {
      email: unconfirmed.email,
      password: TEST_PASSWORD,
    })
    const wrong = await post('/auth/sign-in', { email: confirmed.email, password: 'wrong-pass-1' })

    expect(notConfirmed.status).toBe(400)
    expect(notConfirmed.body).toMatchObject({ code: 'auth.email_not_confirmed' })
    expect(wrong.status).toBe(400)
    expect(wrong.body).toMatchObject({ code: 'auth.invalid_credentials' })
    expect(JSON.stringify([notConfirmed.body, wrong.body])).not.toMatch(
      /Invalid login credentials|Email not confirmed/,
    )
    expect(cookiesOf(wrong)).toEqual([])
  })
})

describe('Origin', () => {
  it.each([
    ['another origin', 'https://evil.example'],
    ['a sibling subdomain of the site', env.API_URL],
    ['the application with another port', `${portal.replace(/:\d+$/, '')}:9`],
  ])('answers 403 request.origin-denied for %s', async (_, origin) => {
    const { email } = await confirmedAccount()

    const res = await post('/auth/sign-in', { email, password: TEST_PASSWORD }, origin)

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'request.origin-denied' })
    expect(cookiesOf(res)).toEqual([])
  })

  it.each([
    ['sign-in', { email: 'a@b.test', password: 'x' }],
    ['sign-up', { email: 'a@b.test' }],
    ['refresh', {}],
    ['sign-out', {}],
  ])('answers 403 to /auth/%s without an Origin', async (name, body) => {
    const res = await post(`/auth/${name}`, body, null)

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'request.origin-denied' })
  })

  it('treats a request without the Origin of an application as no session', async () => {
    const { email } = await confirmedAccount()
    const agent = await signedInAgent('portal', email)

    const noOrigin = await agent.get('/me').set('Origin', '')
    const foreign = await agent.get('/me').set('Origin', 'https://evil.example')
    const otherApplication = await agent.get('/me').set('Origin', panel)
    const own = await agent.get('/me')

    expect([noOrigin.status, foreign.status, otherApplication.status]).toEqual([401, 401, 401])
    expect(own.status).toBe(200)
  })

  it('answers 403 to a request that changes state with a cookie and a foreign Origin', async () => {
    const { email } = await confirmedAccount()
    const agent = await signedInAgent('portal', email)

    const res = await agent.put('/auth/password').set('Origin', 'https://evil.example').send({
      password: 'another-pass-1',
    })

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'request.origin-denied' })
    await signIn(email)
  })
})

describe('refresh', () => {
  it('rotates both cookies and answers 204', async () => {
    const { email } = await confirmedAccount()
    const first = await post('/auth/sign-in', { email, password: TEST_PASSWORD }, portal)
    const before = {
      access: valueOf(cookieNamed(first, 'opos_portal_access')),
      refresh: valueOf(cookieNamed(first, 'opos_portal_refresh')),
    }
    const agent = request.agent(server).set('Origin', portal)
    await agent.post('/auth/sign-in').send({ email, password: TEST_PASSWORD })

    const res = await agent.post('/auth/refresh')

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(
      cookiesOf(res)
        .map((cookie) => cookie.split('=')[0])
        .sort(),
    ).toEqual(['opos_portal_access', 'opos_portal_refresh'])
    expect(valueOf(cookieNamed(res, 'opos_portal_refresh'))).not.toBe(before.refresh)
    expect((await agent.get('/me')).status).toBe(200)
    expect(before.access).toBeTruthy()
  })

  it('answers 401 session.invalid and clears the cookies on a dead session', async () => {
    const { email } = await confirmedAccount()
    const first = await post('/auth/sign-in', { email, password: TEST_PASSWORD })
    const cookie = [
      `opos_portal_access=${valueOf(cookieNamed(first, 'opos_portal_access'))}`,
      `opos_portal_refresh=${valueOf(cookieNamed(first, 'opos_portal_refresh'))}`,
    ].join('; ')
    await post('/auth/sign-out').set('Cookie', cookie).expect(204)

    const res = await post('/auth/refresh').set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
    for (const name of ['opos_portal_access', 'opos_portal_refresh']) {
      expect(cookieNamed(res, name)).toMatch(/^[^=]+=;/)
      expect(cookieNamed(res, name)).toMatch(/Expires=Thu, 01 Jan 1970/)
    }
  })

  it('answers 401 and clears the cookies for a refresh cookie that is no token', async () => {
    const res = await post('/auth/refresh').set('Cookie', 'opos_portal_refresh=not-a-token')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
    expect(cookiesOf(res)).toHaveLength(2)
  })

  it('answers 401 and clears the cookies without a refresh cookie', async () => {
    const res = await post('/auth/refresh')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
    expect(cookiesOf(res)).toHaveLength(2)
  })

  describe('with Supabase Auth failing', () => {
    let outage: Server
    let broken: NestExpressApplication
    let unreachable: NestExpressApplication
    const seen: IncomingHttpHeaders[] = []

    beforeAll(async () => {
      outage = createServer((req, res) => {
        seen.push(req.headers)
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ msg: 'bad gateway' }))
      })
      await new Promise<void>((resolve) => outage.listen(0, '127.0.0.1', resolve))
      const url = `http://127.0.0.1:${(outage.address() as AddressInfo).port}`
      broken = await createApp({ SUPABASE_URL: url })
      unreachable = await createApp({ SUPABASE_URL: 'http://127.0.0.1:1' })
    })

    afterAll(async () => {
      await Promise.all([broken.close(), unreachable.close()])
      outage.close()
    })

    it.each([
      ['answers a 5xx', () => broken],
      ['cannot be reached', () => unreachable],
    ])('answers 503 and keeps the cookies when Supabase Auth %s', async (_, which) => {
      const res = await request(which().getHttpServer())
        .post('/auth/refresh')
        .set('Origin', portal)
        .set('Cookie', 'opos_portal_refresh=some-token')
        .send({})

      expect(res.status).toBe(503)
      expect(res.body).toMatchObject({ code: 'server.unavailable' })
      expect(res.headers['retry-after']).toBe('30')
      expect(cookiesOf(res)).toEqual([])
    })

    it('sends the secret key and the full client address, never the visitor user agent', async () => {
      seen.length = 0

      await request(broken.getHttpServer())
        .post('/auth/sign-up')
        .set('Origin', portal)
        .set('X-Forwarded-For', '2001:db8:1:2:3:4:5:6')
        .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64)')
        .send({ email: 'a@b.test' })

      const [call] = seen
      expect(call?.apikey).toBe(env.SUPABASE_SECRET_KEY)
      expect(call?.['sb-forwarded-for']).toBe('2001:db8:1:2:3:4:5:6')
      expect(call?.['user-agent']).not.toMatch(/Mozilla/)
    })
  })
})

describe('sign-out', () => {
  it('ends this session only: the other application stays signed in', async () => {
    const { email } = await confirmedAccount()
    const inPortal = await signedInAgent('portal', email)
    const inPanel = await signedInAgent('panel', email)

    const res = await inPortal.post('/auth/sign-out')

    expect(res.status).toBe(204)
    expect(
      cookiesOf(res)
        .map((cookie) => cookie.split('=')[0])
        .sort(),
    ).toEqual(['opos_portal_access', 'opos_portal_refresh'])
    expect((await inPortal.get('/me')).status).toBe(401)
    expect((await inPanel.get('/me')).status).toBe(200)
    expect((await inPanel.post('/auth/refresh')).status).toBe(204)
  })

  it('revokes the refresh token it signed out', async () => {
    const { email } = await confirmedAccount()
    const first = await post('/auth/sign-in', { email, password: TEST_PASSWORD })
    const refresh = `opos_portal_refresh=${valueOf(cookieNamed(first, 'opos_portal_refresh'))}`

    await post('/auth/sign-out').set('Cookie', refresh).expect(204)

    const res = await post('/auth/refresh').set('Cookie', refresh)
    expect(res.status).toBe(401)
  })

  it('answers 204 without a session, and when the refresh fails', async () => {
    const none = await post('/auth/sign-out')
    const dead = await post('/auth/sign-out').set('Cookie', 'opos_portal_refresh=not-a-token')

    expect(none.status).toBe(204)
    expect(dead.status).toBe(204)
    expect(cookiesOf(dead)).toHaveLength(2)
  })
})

describe('password', () => {
  it('answers session.reauthentication-required past 5 minutes', async () => {
    const account = await confirmedAccount()
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600
    const token = await mintToken({
      sub: account.id,
      amr: [{ method: 'password', timestamp: tenMinutesAgo }],
    })

    const res = await request(server)
      .put('/auth/password')
      .set('Origin', portal)
      .set('Cookie', `opos_portal_access=${token}; opos_portal_refresh=x`)
      .send({ password: 'another-pass-1' })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
  })

  it('refuses a request without a session', async () => {
    const res = await request(server).put('/auth/password').set('Origin', portal).send({
      password: 'another-pass-1',
    })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it('changes it and ends the other sessions, keeping the caller', async () => {
    const { email } = await confirmedAccount()
    const caller = await signedInAgent('portal', email)
    const other = await signedInAgent('portal', email)

    const res = await caller.put('/auth/password').send({ password: 'brand-new-pass-1' })

    expect(res.status).toBe(204)
    expect((await other.post('/auth/refresh')).status).toBe(401)
    expect((await caller.post('/auth/refresh')).status).toBe(204)
    expect((await caller.get('/me')).status).toBe(200)
    const oldPassword = await post('/auth/sign-in', { email, password: TEST_PASSWORD })
    expect(oldPassword.body).toMatchObject({ code: 'auth.invalid_credentials' })
    await post('/auth/sign-in', { email, password: 'brand-new-pass-1' }).expect(200)
  })

  it('still ends the other sessions on same_password', async () => {
    const { email } = await confirmedAccount()
    const caller = await signedInAgent('portal', email)
    const other = await signedInAgent('portal', email)

    const res = await caller.put('/auth/password').send({ password: TEST_PASSWORD })

    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({ code: 'auth.same_password' })
    expect((await other.post('/auth/refresh')).status).toBe(401)
    expect((await caller.post('/auth/refresh')).status).toBe(204)
  })

  it('leaves the other sessions alone when the password is too weak', async () => {
    const { email } = await confirmedAccount()
    const caller = await signedInAgent('portal', email)
    const other = await signedInAgent('portal', email)

    const res = await caller.put('/auth/password').send({ password: 'short' })

    expect(res.body).toMatchObject({ code: 'auth.weak_password' })
    expect((await other.post('/auth/refresh')).status).toBe(204)
  })

  it('answers 401 session.invalid when the session died elsewhere, not 500', async () => {
    const { email } = await confirmedAccount()
    const caller = await signedInAgent('portal', email)
    const killer = await signedInAgent('portal', email)
    await killer.put('/auth/password').send({ password: 'brand-new-pass-2' }).expect(204)

    const res = await caller.put('/auth/password').send({ password: 'yet-another-pass-3' })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
    expectCleared(res, 'portal')
  })

  it('refuses a password set before the confirmation as soon as verify answers', async () => {
    const address = newAddress()
    // Someone registered the address first, with a password of their own, straight at Supabase Auth.
    const attacker = await fetch(
      `${authUrl(env)}/signup?redirect_to=${encodeURIComponent(`${portal}/auth/confirm`)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, password: 'attacker-pass-1' }),
      },
    )
    expect(attacker.status).toBe(200)
    deleteLater(((await attacker.json()) as { id: string }).id)
    const { tokenHash, type } = await linkFor(address)

    const agent = request.agent(server).set('Origin', portal)
    await agent.post('/auth/verify').send({ tokenHash, type }).expect(200)

    // Before any PUT /auth/password: the owner may leave the form.
    const old = await post('/auth/sign-in', { email: address, password: 'attacker-pass-1' })
    expect(old.body).toMatchObject({ code: 'auth.invalid_credentials' })
    await agent.put('/auth/password').send({ password: 'chosen-pass-1' }).expect(204)
    await post('/auth/sign-in', { email: address, password: 'chosen-pass-1' }).expect(200)
  })

  it('leaves a recovery verification alone: the password stays', async () => {
    const { email } = await confirmedAccount()
    await post('/auth/password/forgot', { email }).expect(202)
    const { tokenHash, type } = await linkFor(email)

    await post('/auth/verify', { tokenHash, type }).expect(200)

    await post('/auth/sign-in', { email, password: TEST_PASSWORD }).expect(200)
  })

  it('hands out no session when the old password cannot be replaced', async () => {
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const address = newAddress()
    const signedUp = await fetch(
      `${authUrl(env)}/signup?redirect_to=${encodeURIComponent(`${portal}/auth/confirm`)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, password: 'attacker-pass-1' }),
      },
    )
    deleteLater(((await signedUp.json()) as { id: string }).id)
    const { tokenHash, type } = await linkFor(address)
    const failing = await failingUserUpdate()
    try {
      const res = await request(failing.app.getHttpServer())
        .post('/auth/verify')
        .set('Origin', portal)
        .send({ tokenHash, type })

      expect(res.status).toBe(500)
      expect(res.body).toMatchObject({ code: 'server.error' })
      expect(cookiesOf(res)).toEqual([])
      expect(warned).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(warned.mock.calls)).not.toContain(address)
    } finally {
      await failing.close()
    }
  })

  it('lets a recovery link sign in and set the password within 5 minutes', async () => {
    const { email } = await confirmedAccount()
    await post('/auth/password/forgot', { email }).expect(202)
    const { tokenHash, type } = await linkFor(email)

    const agent = request.agent(server).set('Origin', portal)
    await agent.post('/auth/verify').send({ tokenHash, type }).expect(200)
    await agent.put('/auth/password').send({ password: 'recovered-pass-1' }).expect(204)

    await post('/auth/sign-in', { email, password: 'recovered-pass-1' }).expect(200)
  })
})

describe('DELETE /me', () => {
  it('clears the cookies of the calling application only', async () => {
    const { email } = await confirmedAccount()
    const inPortal = await signedInAgent('portal', email)

    const res = await inPortal.delete('/me')

    expect(res.status).toBe(204)
    expectCleared(res, 'portal')
    expect((await inPortal.get('/me')).status).toBe(401)
    expect(await accountByEmail(email)).toBeUndefined()
  })

  it('sets no cookie for a Bearer call without the Origin of an application', async () => {
    const { email } = await confirmedAccount()

    const res = await request(server)
      .delete('/me')
      .set('Authorization', `Bearer ${await signIn(email)}`)

    expect(res.status).toBe(204)
    expect(cookiesOf(res)).toEqual([])
  })
})

describe('credentials', () => {
  it('accepts the cookie', async () => {
    const { email, id } = await confirmedAccount()
    const agent = await signedInAgent('portal', email)

    const res = await agent.get('/me')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id, email })
  })

  it('still accepts Bearer until the frontends move', async () => {
    const { email, id } = await confirmedAccount()

    const res = await request(server)
      .get('/me')
      .set('Authorization', `Bearer ${await signIn(email)}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id })
  })

  describe('and the rate limit', () => {
    let limited: NestExpressApplication

    beforeAll(async () => {
      limited = await createApp({}, [], { limit: 3, ttl: 60_000 })
    })

    afterAll(async () => {
      await limited.close()
    })

    const me = (headers: Record<string, string>) =>
      request(limited.getHttpServer())
        .get('/me')
        .set({ Origin: portal, ...headers })

    it('counts against the account for a valid cookie, from any address', async () => {
      const { email } = await confirmedAccount()
      const cookie = `opos_portal_access=${await signIn(email)}`

      const statuses = []
      for (const ip of ['192.0.2.1', '192.0.2.2', '192.0.2.3', '192.0.2.4']) {
        statuses.push((await me({ cookie, 'X-Forwarded-For': ip })).status)
      }

      expect(statuses).toEqual([200, 200, 200, 429])
    })

    it('counts a forged cookie against the address, never the account it names', async () => {
      const { id, email } = await confirmedAccount()
      const forged = await mintToken({ sub: id }, await foreignKey())

      const statuses = []
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (
            await me({
              cookie: `opos_portal_access=${forged}`,
              'X-Forwarded-For': '192.0.2.50',
            })
          ).status,
        )
      }
      const real = await me({
        cookie: `opos_portal_access=${await signIn(email)}`,
        'X-Forwarded-For': '192.0.2.51',
      })

      expect(statuses).toEqual([401, 401, 401, 429])
      expect(real.status).toBe(200)
    })
  })
})

describe('the shared limit of the auth routes', () => {
  it('counts 300 requests per 5 minutes per address across six routes', async () => {
    const unlimited = await createApp({}, [], { limit: 100_000, ttl: 60_000 })
    try {
      const send = (path: string, ip: string, body: object) =>
        request(unlimited.getHttpServer())
          .post(path)
          .set({ Origin: portal, 'X-Forwarded-For': ip })
          .send(body)
      const nobody = { email: 'nobody@example.test' }
      const spend = async (count: number, ip: string) => {
        for (let spent = 0; spent < count; spent += 25) {
          const batch = Array.from({ length: Math.min(25, count - spent) }, (_, i) =>
            (spent + i) % 2 === 0
              ? send('/auth/sign-in', ip, { ...nobody, password: 'x' })
              : send('/auth/password/forgot', ip, nobody),
          )
          const results = await Promise.all(batch)
          for (const res of results) expect(res.status).not.toBe(429)
        }
      }

      await spend(300, '198.51.100.1')
      const over = await send('/auth/resend', '198.51.100.1', nobody)
      const other = await send('/auth/resend', '198.51.100.2', nobody)

      expect(over.status).toBe(429)
      expect(over.body).toMatchObject({ code: 'request.rate-limited' })
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0)
      expect(other.status).toBe(202)
    } finally {
      await unlimited.close()
    }
  }, 120_000)
})
