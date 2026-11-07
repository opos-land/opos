import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract, type ContractMeta } from '@opos/contract'
import {
  type AnyContractProcedure,
  type AnyContractRouter,
  isContractProcedure,
} from '@orpc/contract'
import { decodeJwt } from 'jose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { authUrl, loadEnv } from '../src/config/env'
import { createApp } from './app'
import {
  bindApi,
  createAccount,
  deleteCreatedAccounts,
  deleteLater,
  mintToken,
  originOf,
  session,
  TEST_PASSWORD,
  testEmail,
} from './auth'
import { HOOK_PORT_TIMEOUT_MS, listenOnHookPort } from './hook-port'
import { confirmLinkIn, deleteMail, waitForMail } from './mailpit'
import { ProbeModule } from './probe'
import { addVerifiedFactor, closeTenantDb } from './tenants'

// The guard asks for the second factor where an account turned it on. A session
// below aal2 on such an account reaches no route but the ones that let it finish signing in; no
// other sign-in path raises the level or skips it.

const env = loadEnv()
const portal = originOf('portal')
const addresses: string[] = []
let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>

beforeAll(async () => {
  app = await createApp({}, [ProbeModule])
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

/** A confirmed account that turned on two-factor authentication. */
async function accountWith2fa() {
  const account = await createAccount()
  addresses.push(account.email)
  await addVerifiedFactor(account.id)
  return account
}

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  return header === undefined ? [] : [header].flat()
}

const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((cookie) => cookie.startsWith(`${name}=`))

const valueOf = (cookie: string | undefined) => cookie?.split(';')[0]?.split('=').slice(1).join('=')

/** A browser of the portal that signed in with the password: aal1 cookies, whatever the answer. */
async function passwordAgent(email: string) {
  const agent = request.agent(server).set('Origin', portal)
  const res = await agent.post('/auth/sign-in').send({ email, password: TEST_PASSWORD })
  return { agent, res }
}

const mfaRequired = { code: 'session.mfa-required' }

describe('JwtAuthGuard below aal2', () => {
  it('an aal1 token on an account with 2FA gets 401 session.mfa-required on GET /me', async () => {
    const { id } = await accountWith2fa()

    const res = await request(server)
      .get('/me')
      .use(session(await mintToken({ sub: id, aal: 'aal1' })))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
  })

  it('a token that names no level counts as below aal2', async () => {
    const { id } = await accountWith2fa()

    const res = await request(server)
      .get('/me')
      .use(session(await mintToken({ sub: id })))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
  })

  it('an aal2 token passes', async () => {
    const { id } = await accountWith2fa()

    const res = await request(server)
      .get('/me')
      .use(session(await mintToken({ sub: id, aal: 'aal2' })))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id, mfaEnabled: true })
  })

  it('an account without 2FA passes at aal1', async () => {
    const { id } = await createAccount()

    const res = await request(server)
      .get('/me')
      .use(session(await mintToken({ sub: id, aal: 'aal1' })))

    expect(res.status).toBe(200)
  })

  it('an account with an unverified factor only passes at aal1', async () => {
    const { id } = await createAccount()
    await addVerifiedFactor(id, 'unverified')

    const res = await request(server)
      .get('/me')
      .use(session(await mintToken({ sub: id, aal: 'aal1' })))

    expect(res.status).toBe(200)
  })

  it('a route marked @AllowMfaPending lets an aal1 token through, and one without it does not', async () => {
    const { id } = await accountWith2fa()
    const token = await mintToken({ sub: id, aal: 'aal1' })

    const allowed = await request(server).get('/probe/mfa-pending').use(session(token))
    const refused = await request(server).get('/probe/outside').use(session(token))

    expect(allowed.status).toBe(200)
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject(mfaRequired)
  })

  it('@AllowMfaPending still asks for a session and an account', async () => {
    const none = await request(server).get('/probe/mfa-pending').set('Origin', portal)
    const stranger = await request(server)
      .get('/probe/mfa-pending')
      .use(session(await mintToken({ sub: randomUUID(), aal: 'aal1' })))

    expect(none.status).toBe(401)
    expect(none.body).toMatchObject({ code: 'session.invalid' })
    expect(stranger.status).toBe(401)
    expect(stranger.body).toMatchObject({ code: 'session.invalid' })
  })

  it('an access token from before the factor was verified loses access at once', async () => {
    const { id } = await createAccount()
    const token = await mintToken({ sub: id, aal: 'aal1' })
    await request(server).get('/me').use(session(token)).expect(200)

    await addVerifiedFactor(id)

    const res = await request(server).get('/me').use(session(token))
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
  })
})

const tenantRoutes = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) => {
    if (!isContractProcedure(value)) return tenantRoutes(value, `${prefix}${key}.`)
    const meta = value['~orpc'].meta as ContractMeta
    return meta.tenant ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]] : []
  })

describe('tenant routes below aal2', () => {
  let id: string

  beforeAll(async () => {
    id = (await accountWith2fa()).id
  })

  it.each(tenantRoutes(contract))(
    'a tenant route refuses aal1 before any permission check: %s',
    async (_, procedure) => {
      const { method = 'GET', path = '/' } = procedure['~orpc'].route
      const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'

      // An unknown tenant would answer 404 and a stranger 403: the guard answers first.
      const agent = request(server)
      const res = await agent[verb](path.replace(/\{[^}]+\}/g, randomUUID()))
        .use(session(await mintToken({ sub: id, aal: 'aal1' })))
        .set('X-Tenant-Slug', `missing-${randomUUID().slice(0, 8)}`)
        .send({})

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject(mfaRequired)
    },
  )
})

/** Every route of the contract, to find the account routes among them. */
const procedures = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) =>
    isContractProcedure(value)
      ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]]
      : procedures(value, `${prefix}${key}.`),
  )

function isPublicRoute(procedure: AnyContractProcedure) {
  const { spec } = procedure['~orpc'].route
  const operation = typeof spec === 'function' ? spec({ responses: {} }) : spec
  return Array.isArray(operation?.security) && operation.security.length === 0
}

const accountRoutes = procedures(contract).filter(
  ([, procedure]) =>
    (procedure['~orpc'].meta as ContractMeta).tenant !== true && !isPublicRoute(procedure),
)

/** The routes that finish a sign-in: the only ones @AllowMfaPending may stand on. */
const finishesSignIn = (procedure: AnyContractProcedure) => {
  const { method, path } = procedure['~orpc'].route
  return method === 'POST' && path?.startsWith('/auth/mfa/') === true
}

describe('account routes below aal2', () => {
  let id: string

  beforeAll(async () => {
    id = (await accountWith2fa()).id
  })

  it.each(accountRoutes.filter(([, procedure]) => !finishesSignIn(procedure)))(
    'refuses aal1 on an account with 2FA: %s',
    async (_, procedure) => {
      const { method = 'GET', path = '/' } = procedure['~orpc'].route
      const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'

      const agent = request(server)
      const res = await agent[verb](path.replace(/\{[^}]+\}/g, randomUUID()))
        .use(session(await mintToken({ sub: id, aal: 'aal1' })))
        .send({})

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject(mfaRequired)
    },
  )
})

describe('sign-in paths on an account with 2FA', () => {
  it('sign-in with the right password sets cookies and answers session.mfa-required', async () => {
    const { email } = await accountWith2fa()

    const { res } = await passwordAgent(email)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
    expect(cookieNamed(res, 'opos_portal_access')).toBeDefined()
    expect(cookieNamed(res, 'opos_portal_refresh')).toBeDefined()
    expect(decodeJwt(valueOf(cookieNamed(res, 'opos_portal_access'))!)).toMatchObject({
      aal: 'aal1',
    })
  })

  it('sign-in with a wrong password still answers auth.invalid_credentials', async () => {
    const { email } = await accountWith2fa()

    const res = await request(server)
      .post('/auth/sign-in')
      .set('Origin', portal)
      .send({ email, password: 'not-the-password-1' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'auth.invalid_credentials' })
    expect(cookiesOf(res)).toEqual([])
  })

  it('the cookies of that sign-in reach no route but the ones that finish it', async () => {
    const { email } = await accountWith2fa()
    const { agent } = await passwordAgent(email)

    const res = await agent.get('/me')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
  })

  it('POST /auth/sign-out works at aal1', async () => {
    const { email } = await accountWith2fa()
    const { agent } = await passwordAgent(email)

    const res = await agent.post('/auth/sign-out')

    expect(res.status).toBe(204)
    expect(cookieNamed(res, 'opos_portal_access')).toMatch(/^opos_portal_access=;/)
  })

  it('a refresh of an aal1 session stays aal1', async () => {
    const { email } = await accountWith2fa()
    const { agent } = await passwordAgent(email)

    const res = await agent.post('/auth/refresh')

    expect(res.status).toBe(204)
    const refreshed = valueOf(cookieNamed(res, 'opos_portal_access'))
    expect(decodeJwt(refreshed!)).toMatchObject({ aal: 'aal1' })
    const me = await agent.get('/me')
    expect(me.status).toBe(401)
    expect(me.body).toMatchObject(mfaRequired)
  })

  it('a recovery link on a 2FA account cannot change the password at aal1', async () => {
    const { email } = await accountWith2fa()
    await request(server).post('/auth/password/forgot').set('Origin', portal).send({ email })
    const mails = await waitForMail(email)
    const link = confirmLinkIn(mails[0]!)
    const tokenHash = link.searchParams.get('token_hash')!

    const agent = request.agent(server).set('Origin', portal)
    const verified = await agent.post('/auth/verify').send({ tokenHash, type: 'recovery' })
    const changed = await agent.put('/auth/password').send({ password: 'new-password-1' })

    expect(verified.status).toBe(401)
    expect(verified.body).toMatchObject(mfaRequired)
    expect(cookieNamed(verified, 'opos_portal_access')).toBeDefined()
    expect(changed.status).toBe(401)
    expect(changed.body).toMatchObject(mfaRequired)
    // The old password still signs in; the new one does not exist.
    const old = await request(server)
      .post('/auth/sign-in')
      .set('Origin', portal)
      .send({ email, password: TEST_PASSWORD })
    const attempted = await request(server)
      .post('/auth/sign-in')
      .set('Origin', portal)
      .send({ email, password: 'new-password-1' })
    expect(old.body).toMatchObject(mfaRequired)
    expect(attempted.body).toMatchObject({ code: 'auth.invalid_credentials' })
  })

  it('a confirmation link of an account that holds a factor signs nobody in', async () => {
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    // Out of reach in practice (a factor needs a session, which needs a confirmed address), but the
    // route must not depend on that: updateUser at aal1 is refused and no cookie is set.
    const address = testEmail('mfa')
    addresses.push(address)
    const signedUp = await fetch(
      `${authUrl(env)}/signup?redirect_to=${encodeURIComponent(`${portal}/auth/confirm`)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, password: 'attacker-pass-1' }),
      },
    )
    const { id } = (await signedUp.json()) as { id: string }
    deleteLater(id)
    await addVerifiedFactor(id)
    const link = confirmLinkIn((await waitForMail(address))[0]!)

    const res = await request(server)
      .post('/auth/verify')
      .set('Origin', portal)
      .send({ tokenHash: link.searchParams.get('token_hash')!, type: 'signup' })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject(mfaRequired)
    expect(cookiesOf(res)).toEqual([])
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('replace the password'))
    warned.mockRestore()
  })
})
