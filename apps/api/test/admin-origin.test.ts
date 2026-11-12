import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract } from '@opos/contract'
import {
  type AnyContractProcedure,
  type AnyContractRouter,
  isContractProcedure,
} from '@orpc/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, originOf, signedInAgent } from './auth'

// The admin application signs in through the API like the other two, with a cookie pair of its
// own, and its origin reaches only what it needs (docs/adr/0030): the admin routes, sign-in,
// refresh, sign-out, the code of two-factor authentication and the account's own name, language
// and theme. Every other route of the contract answers 403 `request.origin-denied` to it.

const procedures = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) =>
    isContractProcedure(value)
      ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]]
      : procedures(value, `${prefix}${key}.`),
  )

const routeOf = (procedure: AnyContractProcedure) => {
  const { method = 'GET', path = '/' } = procedure['~orpc'].route
  return { method, path }
}

/** What the admin application may call outside `/admin`. */
const allowed = [
  'GET /health',
  'POST /auth/sign-in',
  'POST /auth/refresh',
  'POST /auth/sign-out',
  'POST /auth/mfa/verify',
  'GET /me',
  'PATCH /me',
]

const reaches = ({ method, path }: { method: string; path: string }) =>
  path.startsWith('/admin/') || allowed.includes(`${method} ${path}`)

let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await app.close()
})

const call = (procedure: AnyContractProcedure, origin: string) => {
  const { method, path } = routeOf(procedure)
  const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
  const agent = request(app.getHttpServer())
  return agent[verb](path.replace(/\{[^}]+\}/g, randomUUID()))
    .set('Origin', origin)
    .send({})
}

describe("the admin application's origin", () => {
  const all = procedures(contract)

  it('names every route it lets through in the contract', () => {
    const paths = all.map(([, procedure]) => routeOf(procedure))
    for (const entry of allowed) {
      expect(
        paths.some(({ method, path }) => `${method} ${path}` === entry),
        entry,
      ).toBe(true)
    }
  })

  it.each(all.filter(([, procedure]) => !reaches(routeOf(procedure))))(
    '%s answers 403 request.origin-denied',
    async (_, procedure) => {
      const res = await call(procedure, originOf('admin'))

      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'request.origin-denied' })
    },
  )

  it.each(all.filter(([, procedure]) => reaches(routeOf(procedure))))(
    '%s is not refused for its origin',
    async (_, procedure) => {
      const res = await call(procedure, originOf('admin'))

      expect((res.body as { code?: string }).code).not.toBe('request.origin-denied')
    },
  )

  it.each(all.filter(([, procedure]) => !reaches(routeOf(procedure))))(
    '%s is still served to the portal',
    async (_, procedure) => {
      const res = await call(procedure, originOf('portal'))

      expect((res.body as { code?: string }).code).not.toBe('request.origin-denied')
    },
  )
})

describe("the admin application's session", () => {
  it('lives in a cookie pair of its own, the refresh cookie for 30 minutes', async () => {
    const account = await createAccount()
    const res = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('Origin', originOf('admin'))
      .send({ email: account.email, password: 'test-password-123' })

    expect(res.status).toBe(200)
    const cookies = (res.headers['set-cookie'] as unknown as string[]).map((cookie) => ({
      name: cookie.split('=')[0],
      maxAge: /Max-Age=(\d+)/.exec(cookie)?.[1],
    }))
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual([
      'opos_admin_access',
      'opos_admin_refresh',
    ])
    expect(cookies.find((cookie) => cookie.name === 'opos_admin_refresh')?.maxAge).toBe('1800')
  })

  it('is no session of the panel or the portal, and theirs is none of it', async () => {
    const account = await createAccount()
    const admin = await signedInAgent('admin', account.email)
    const panel = await signedInAgent('panel', account.email)

    expect((await admin.get('/me')).status).toBe(200)
    for (const other of ['panel', 'portal'] as const) {
      expect((await admin.get('/me').set('Origin', originOf(other))).status, other).toBe(401)
    }
    expect((await panel.get('/me').set('Origin', originOf('admin'))).status).toBe(401)
  })

  it('ends alone: signing out of the admin application leaves the panel signed in', async () => {
    const account = await createAccount()
    const agent = await signedInAgent('panel', account.email)
    const signIn = await agent
      .post('/auth/sign-in')
      .set('Origin', originOf('admin'))
      .send({ email: account.email, password: 'test-password-123' })
    expect(signIn.status).toBe(200)

    expect((await agent.post('/auth/sign-out').set('Origin', originOf('admin'))).status).toBe(204)

    expect((await agent.get('/me').set('Origin', originOf('admin'))).status).toBe(401)
    expect((await agent.get('/me')).status).toBe(200)
  })
})
