import { randomUUID } from 'node:crypto'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { MetadataScanner, ModulesContainer } from '@nestjs/core'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type AdminAction, type AdminTenant, type AdminTenantDetails } from '@opos/contract'
import { adminContract } from '@opos/contract'
import { type AnyContractProcedure } from '@orpc/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { ADMIN_REQUIREMENT, AdminGuard } from '../src/modules/admin/require-admin.decorator'
import { createApp } from './app'
import {
  bindApi,
  createAccount,
  deleteCreatedAccounts,
  enableMfa,
  originOf,
  signedInAgent,
  signIn,
  TEST_PASSWORD,
  testEmail,
} from './auth'
import {
  adminAccount,
  adminHeaders,
  closeAdminDb,
  countLoggedActions,
  grant,
  loggedActions,
  removeFactors,
  sessionToken,
} from './admins'
import { deleteMail, waitForMail } from './mailpit'
import {
  addEdition,
  addRecoveryCodeHash,
  addVerifiedFactor,
  closeTenantDb,
  deleteCreatedTenants,
  mfaState,
  recoveryCodeRows,
  restore,
  suspend,
  tenantWithHead,
} from './tenants'

// The admin routes (docs/specs/platform-administration.md): each against every actor, then what
// each changes, what it refuses and the entry it leaves in the log.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

const routes = Object.entries(adminContract) as [keyof typeof adminContract, AnyContractProcedure][]
/** The two routes no screen can undo need a sign-in younger than 5 minutes. */
const fresh = new Set<string>(['deleteTenant', 'resetTwoFactor'])

let app: NestExpressApplication
let admin: Awaited<ReturnType<typeof adminAccount>>
let token: string
const addresses: string[] = []

const api = () => request(app.getHttpServer())

/** Calls a route with an empty body and random identifiers, so a request let through changes nothing. */
function call(procedure: AnyContractProcedure, headers: Record<string, string>) {
  const { method = 'GET', path = '/' } = procedure['~orpc'].route
  const verb = method.toLowerCase() as Method
  const agent = api()
  const req = agent[verb](path.replace(/\{[^}]+\}/g, randomUUID())).set(headers)
  return verb === 'get' ? req : req.send({})
}

const asAdmin = (req: request.Test, as = token) => req.set(adminHeaders(as))

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
  admin = await adminAccount({ first_name: 'Ada', last_name: 'Admin' })
  token = await sessionToken(admin.id)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await closeAdminDb()
  await app.close()
})

describe('every admin route', () => {
  it.each(routes)('%s refuses a request without a session', async (_, procedure) => {
    const res = await call(procedure, { origin: originOf('admin') })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it.each(routes)(
    "%s refuses an admin's session in the panel and in the portal",
    async (_, procedure) => {
      for (const other of ['panel', 'portal'] as const) {
        const res = await call(procedure, {
          origin: originOf(other),
          cookie: `opos_${other}_access=${token}`,
        })

        expect(res.status, other).toBe(403)
        expect(res.body, other).toMatchObject({ code: 'request.origin-denied' })
      }
    },
  )

  it.each(routes)("%s reads no cookie but the admin application's own", async (_, procedure) => {
    const res = await call(procedure, {
      origin: originOf('admin'),
      cookie: `opos_panel_access=${token}; opos_portal_access=${token}`,
    })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it.each(routes)('%s refuses an account that is no admin', async (_, procedure) => {
    const account = await createAccount()
    await addVerifiedFactor(account.id)

    const res = await call(procedure, adminHeaders(await sessionToken(account.id)))

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'permission.denied' })
  })

  it.each(routes)(
    '%s refuses an admin who turned two-factor authentication off',
    async (_, procedure) => {
      const account = await adminAccount()
      await removeFactors(account.id)

      // Signed in with the password alone, as an account without a second factor is.
      const res = await call(
        procedure,
        adminHeaders(await sessionToken(account.id, { aal: 'aal1' })),
      )

      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'admin.mfa-not-enabled' })
    },
  )

  it.each(routes)(
    '%s refuses an admin whose second factor is newer than the grant',
    async (_, procedure) => {
      const account = await adminAccount()
      await removeFactors(account.id)
      await addVerifiedFactor(account.id)

      const res = await call(procedure, adminHeaders(await sessionToken(account.id)))

      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'admin.grant-outdated' })
    },
  )

  it.each(routes)('%s refuses an admin session that gave no code', async (_, procedure) => {
    const res = await call(procedure, adminHeaders(await sessionToken(admin.id, { aal: 'aal1' })))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.mfa-required' })
  })

  it.each(routes)('%s refuses a sign-in older than 30 minutes', async (_, procedure) => {
    const old = await sessionToken(admin.id, { signedInSecondsAgo: 30 * 60 + 5 })

    const res = await call(procedure, adminHeaders(old))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
  })

  it.each(routes)(
    '%s takes a sign-in of 6 minutes ago unless it cannot be undone',
    async (name, procedure) => {
      const stale = await sessionToken(admin.id, { signedInSecondsAgo: 6 * 60 })

      const res = await call(procedure, adminHeaders(stale))

      if (fresh.has(name)) {
        expect(res.status).toBe(401)
        expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
      } else {
        expect([401, 403], JSON.stringify(res.body)).not.toContain(res.status)
      }
    },
  )

  it.each(routes)('%s lets an admin through', async (_, procedure) => {
    const res = await call(procedure, adminHeaders(token))

    // Through the guard means a handler answer: never 401 or 403, and never a 5xx.
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(500)
    expect([401, 403], JSON.stringify(res.body)).not.toContain(res.status)
  })

  it('lets a new grant open them again after the factor was replaced', async () => {
    const account = await adminAccount()
    await removeFactors(account.id)
    await addVerifiedFactor(account.id)
    const headers = adminHeaders(await sessionToken(account.id))
    expect((await api().get('/admin/tenants').set(headers)).status).toBe(403)

    await grant(account.email)

    expect((await api().get('/admin/tenants').set(headers)).status).toBe(200)
  })
})

// The origin check lets every path under /admin/ through to its route, so a route there that is
// no admin route would be open to any session of the admin application.
describe('the routes the API registers under /admin/', () => {
  it('are admin routes, each behind JwtAuthGuard and AdminGuard, and no admin route is elsewhere', () => {
    const scanner = new MetadataScanner()
    const controllers = [...app.get(ModulesContainer).values()].flatMap((module) => [
      ...module.controllers.values(),
    ])
    const routes = controllers
      .flatMap(({ instance }) => {
        const prototype = Object.getPrototypeOf(instance) as Record<string, object>
        return scanner.getAllMethodNames(prototype).map((name) => {
          const handler = prototype[name]!
          const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined
          return {
            name,
            paths: [path ?? []].flat().map((entry) => `/${entry}`.replace(/^\/+/, '/')),
            admin: Reflect.getMetadata(ADMIN_REQUIREMENT, handler) !== undefined,
            guards: (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[],
          }
        })
      })
      .filter((route) => route.paths.length > 0)

    const underAdmin = routes.filter((route) =>
      route.paths.some((path) => path === '/admin' || path.startsWith('/admin/')),
    )
    expect(underAdmin.map((route) => route.name).sort()).toEqual(Object.keys(adminContract).sort())
    for (const route of routes) {
      const isUnder = underAdmin.includes(route)
      expect(route.admin, route.name).toBe(isUnder)
      if (isUnder) expect(route.guards, route.name).toEqual([JwtAuthGuard, AdminGuard])
    }
  })
})

describe('an API without the admin application', () => {
  it('serves no admin route and knows no admin origin', async () => {
    const plain = await createApp({ ADMIN_URL: '', DATABASE_ADMIN_URL: '' })
    try {
      const res = await request(plain.getHttpServer())
        .get('/admin/tenants')
        .set(adminHeaders(token))

      expect(res.status).toBe(404)
      const me = await request(plain.getHttpServer()).get('/me').set(adminHeaders(token))
      expect(me.status).toBe(401)
    } finally {
      await plain.close()
    }
  })
})

describe('GET /admin/tenants', () => {
  it('lists every tenant with its address and whether it is suspended', async () => {
    const [on, off] = await Promise.all([tenantWithHead(), tenantWithHead()])
    await suspend(off.id)

    const res = await asAdmin(api().get('/admin/tenants'))

    expect(res.status).toBe(200)
    const tenants = res.body as AdminTenant[]
    const names = tenants.map((tenant) => tenant.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(tenants.find((tenant) => tenant.id === on.id)).toMatchObject({
      slug: on.slug,
      suspendedAt: null,
      defaultLocale: 'pl',
      timezone: 'Europe/Warsaw',
    })
    const suspended = tenants.find((tenant) => tenant.id === off.id)
    expect(suspended?.suspendedAt).toEqual(expect.any(String))
    expect(Date.parse(suspended!.createdAt)).not.toBeNaN()
    // Nothing of a tenant's team, editions or programme.
    expect(Object.keys(suspended!).sort()).toEqual(
      ['createdAt', 'defaultLocale', 'id', 'name', 'slug', 'suspendedAt', 'timezone'].sort(),
    )
  })
})

describe('GET /admin/tenants/{tenantId}', () => {
  it('shows a tenant with its heads, by name and email address', async () => {
    const tenant = await tenantWithHead()

    const res = await asAdmin(api().get(`/admin/tenants/${tenant.id}`))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: tenant.id,
      slug: tenant.slug,
      heads: [{ accountId: tenant.head.id, email: tenant.head.email }],
    })
  })

  it('answers 404 for an unknown tenant and for what is no identifier', async () => {
    for (const id of [randomUUID(), 'convention-a']) {
      const res = await asAdmin(api().get(`/admin/tenants/${id}`))
      expect([400, 404], id).toContain(res.status)
    }
    expect((await asAdmin(api().get(`/admin/tenants/${randomUUID()}`))).body).toMatchObject({
      code: 'request.not-found',
    })
  })
})

describe('POST /admin/tenants', () => {
  const body = (override: Record<string, unknown> = {}) => ({
    name: 'New convention',
    slug: `new-${randomUUID().slice(0, 8)}`,
    defaultLocale: 'en',
    timezone: 'Europe/Prague',
    ...override,
  })
  const create = (send: Record<string, unknown>) => asAdmin(api().post('/admin/tenants')).send(send)

  it('creates a tenant with its first head, who opens it at once', async () => {
    const head = await createAccount({ first_name: 'Hanna' })
    const sent = body({ headEmail: head.email.toUpperCase() })

    const res = await create(sent)

    expect(res.status).toBe(201)
    const created = res.body as AdminTenantDetails
    expect(created).toMatchObject({
      slug: sent.slug,
      name: 'New convention',
      defaultLocale: 'en',
      timezone: 'Europe/Prague',
      suspendedAt: null,
      heads: [{ accountId: head.id, email: head.email, firstName: 'Hanna' }],
    })
    const current = await api()
      .get('/tenants/current')
      .set({
        origin: originOf('panel'),
        cookie: `opos_panel_access=${await signIn(head.email)}`,
        'X-Tenant-Slug': sent.slug,
      })
    expect(current.status).toBe(200)
    expect(await loggedActions({ tenantId: created.id })).toEqual([
      {
        action: 'tenant.create',
        admin_account_id: admin.id,
        subject_tenant_id: created.id,
        tenant_slug: sent.slug,
        subject_account_id: head.id,
      },
    ])
    await asAdmin(api().post(`/admin/tenants/${created.id}/suspend`))
    await asAdmin(api().delete(`/admin/tenants/${created.id}`))
  })

  it.each([
    ['an unknown email address', () => testEmail('nobody'), 404, 'account.not-found'],
    [
      'an email address that is not confirmed',
      async () => (await createAccount({}, { confirmed: false })).email,
      409,
      'account.unconfirmed',
    ],
  ])('creates nothing for %s', async (_, email, status, code) => {
    const headEmail = await email()
    const sent = body({ headEmail })
    const before = await countLoggedActions()

    const res = await create(sent)

    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ code })
    // The answer names no address, the admin's own input included.
    expect(JSON.stringify(res.body)).not.toContain(headEmail)
    expect((await api().get(`/public/tenants/${sent.slug}`)).status).toBe(404)
    expect(await countLoggedActions()).toBe(before)
  })

  it('refuses a taken slug, a reserved one and the slug of a deleted tenant', async () => {
    const head = await createAccount()
    const taken = await tenantWithHead()
    const gone = await tenantWithHead()
    await suspend(gone.id)
    expect((await asAdmin(api().delete(`/admin/tenants/${gone.id}`))).status).toBe(204)
    const before = await countLoggedActions()

    for (const [slug, code] of [
      [taken.slug, 'tenant.slug-taken'],
      ['panel', 'tenant.slug-reserved'],
      [gone.slug, 'tenant.slug-retired'],
    ] as const) {
      const res = await create(body({ slug, headEmail: head.email }))

      expect(res.status, slug).toBe(409)
      expect(res.body, slug).toMatchObject({ code })
    }
    expect(await countLoggedActions()).toBe(before)
  })

  it.each([
    ['no name', { name: ' ' }],
    ['a malformed slug', { slug: 'Bad_Slug' }],
    ['an unsupported language', { defaultLocale: 'cs' }],
    ['an unknown time zone', { timezone: 'Mars/Olympus' }],
    ['a field it does not know', { suspendedAt: new Date().toISOString() }],
  ])('answers 400 for %s', async (_, override) => {
    const head = await createAccount()

    const res = await create(body({ headEmail: head.email, ...override }))

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })
})

describe('PUT /admin/tenants/{tenantId}/slug', () => {
  const rename = (id: string, slug: string) =>
    asAdmin(api().put(`/admin/tenants/${id}/slug`)).send({ slug })

  it('moves the tenant: the new address answers at once and the old one is not found', async () => {
    const tenant = await tenantWithHead()
    const next = `moved-${randomUUID().slice(0, 8)}`

    const res = await rename(tenant.id, next)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: tenant.id, slug: next })
    expect((await api().get(`/public/tenants/${next}`)).status).toBe(200)
    expect((await api().get(`/public/tenants/${tenant.slug}`)).status).toBe(404)
    expect(await loggedActions({ tenantId: tenant.id })).toEqual([
      {
        action: 'tenant.rename',
        admin_account_id: admin.id,
        subject_tenant_id: tenant.id,
        tenant_slug: next,
        subject_account_id: null,
      },
    ])
  })

  it('leaves no entry for the slug the tenant already has', async () => {
    const tenant = await tenantWithHead()

    const res = await rename(tenant.id, tenant.slug)

    expect(res.status).toBe(200)
    expect(await loggedActions({ tenantId: tenant.id })).toEqual([])
  })

  it('refuses a taken, a reserved and a retired slug, and an unknown tenant', async () => {
    const [tenant, taken, gone] = await Promise.all([
      tenantWithHead(),
      tenantWithHead(),
      tenantWithHead(),
    ])
    await suspend(gone.id)
    await asAdmin(api().delete(`/admin/tenants/${gone.id}`))

    for (const [slug, code] of [
      [taken.slug, 'tenant.slug-taken'],
      ['scanner', 'tenant.slug-reserved'],
      [gone.slug, 'tenant.slug-retired'],
    ] as const) {
      const res = await rename(tenant.id, slug)

      expect(res.status, slug).toBe(409)
      expect(res.body, slug).toMatchObject({ code })
    }
    expect((await rename(tenant.id, 'Bad_Slug')).status).toBe(400)
    expect((await rename(randomUUID(), `free-${randomUUID().slice(0, 8)}`)).status).toBe(404)
    expect((await api().get(`/public/tenants/${tenant.slug}`)).status).toBe(200)
    expect(await loggedActions({ tenantId: tenant.id })).toEqual([])
  })
})

describe('suspending and restoring a tenant', () => {
  const act = (id: string, action: 'suspend' | 'restore') =>
    asAdmin(api().post(`/admin/tenants/${id}/${action}`))

  it('suspends once and restores once, each leaving one entry', async () => {
    const tenant = await tenantWithHead()
    await addEdition(tenant.id, { slug: '2027', isPublished: true })

    const suspended = await act(tenant.id, 'suspend')
    expect(suspended.status).toBe(200)
    expect((suspended.body as AdminTenant).suspendedAt).toEqual(expect.any(String))
    expect((await api().get(`/public/tenants/${tenant.slug}`)).status).toBe(404)
    // A suspended tenant stays suspended, at the moment it was first suspended.
    const again = await act(tenant.id, 'suspend')
    expect(again.status).toBe(200)
    expect((again.body as AdminTenant).suspendedAt).toBe(
      (suspended.body as AdminTenant).suspendedAt,
    )

    const restored = await act(tenant.id, 'restore')
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ suspendedAt: null })
    expect((await api().get(`/public/tenants/${tenant.slug}/editions`)).status).toBe(200)
    expect((await act(tenant.id, 'restore')).status).toBe(200)

    expect((await loggedActions({ tenantId: tenant.id })).map((entry) => entry.action)).toEqual([
      'tenant.suspend',
      'tenant.restore',
    ])
  })

  it('answers 404 for an unknown tenant', async () => {
    for (const action of ['suspend', 'restore'] as const) {
      const res = await act(randomUUID(), action)

      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'request.not-found' })
    }
  })
})

describe('DELETE /admin/tenants/{tenantId}', () => {
  const remove = (id: string) => asAdmin(api().delete(`/admin/tenants/${id}`))

  it('refuses a tenant that is not suspended', async () => {
    const tenant = await tenantWithHead()

    const res = await remove(tenant.id)

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'tenant.not-suspended' })
    expect((await api().get(`/public/tenants/${tenant.slug}`)).status).toBe(200)
    expect(await loggedActions({ tenantId: tenant.id })).toEqual([])
  })

  it('deletes a suspended tenant for good, and its head still signs in', async () => {
    const tenant = await tenantWithHead()
    await addEdition(tenant.id, { slug: '2027', isPublished: true })
    await suspend(tenant.id)

    const res = await remove(tenant.id)

    expect(res.status).toBe(204)
    expect((await asAdmin(api().get(`/admin/tenants/${tenant.id}`))).status).toBe(404)
    await restore(tenant.id).catch(() => undefined)
    expect((await api().get(`/public/tenants/${tenant.slug}`)).status).toBe(404)
    expect(await loggedActions({ tenantId: tenant.id })).toEqual([
      {
        action: 'tenant.delete',
        admin_account_id: admin.id,
        subject_tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        subject_account_id: null,
      },
    ])
    const memberships = await api()
      .get('/me/memberships')
      .set({
        origin: originOf('panel'),
        cookie: `opos_panel_access=${await signIn(tenant.head.email)}`,
      })
    expect(memberships.status).toBe(200)
    expect(memberships.body).toEqual([])
  })

  it('answers 404 for an unknown tenant', async () => {
    expect((await remove(randomUUID())).status).toBe(404)
  })
})

describe('POST /admin/accounts/reset-2fa', () => {
  const reset = (email: string) => asAdmin(api().post('/admin/accounts/reset-2fa')).send({ email })

  async function personWith2fa(metadata: Record<string, string> = {}) {
    const account = await createAccount(metadata)
    addresses.push(account.email)
    const agent = await signedInAgent('portal', account.email)
    return { ...account, ...(await enableMfa(agent)) }
  }

  it('removes the factors and the unused codes, mails the account and leaves an entry', async () => {
    const person = await personWith2fa({ locale: 'pl' })
    await addRecoveryCodeHash(person.id, 'a'.repeat(64))

    const res = await reset(`  ${person.email.toUpperCase()} `.trim())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ emailSent: true })
    expect(await mfaState(person.id)).toEqual({ mirrored: false, factors: 0 })
    expect(await recoveryCodeRows(person.id)).toHaveLength(0)
    const [sent] = await waitForMail(person.email)
    expect(sent!.Subject).toBe('Uwierzytelnianie dwuskładnikowe zostało wyłączone')
    expect(await loggedActions({ accountId: person.id })).toEqual([
      {
        action: 'account.reset-2fa',
        admin_account_id: admin.id,
        subject_tenant_id: null,
        tenant_slug: null,
        subject_account_id: person.id,
      },
    ])
    // The person signs in with the password alone again.
    const signedIn = await api()
      .post('/auth/sign-in')
      .set('Origin', originOf('portal'))
      .send({ email: person.email, password: TEST_PASSWORD })
    expect(signedIn.status).toBe(200)
  })

  it.each([
    ['an unknown address', () => testEmail('nobody'), 404, 'account.not-found'],
    [
      'an address that is not confirmed',
      async () => (await createAccount({}, { confirmed: false })).email,
      409,
      'account.unconfirmed',
    ],
    [
      'an account with two-factor authentication off',
      async () => (await createAccount()).email,
      409,
      'mfa.not-enabled',
    ],
  ])('refuses %s and writes nothing', async (_, email, status, code) => {
    const before = await countLoggedActions()

    const res = await reset(await email())

    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ code })
    expect(await countLoggedActions()).toBe(before)
  })

  it.each([
    ['pl', 'Uwierzytelnianie dwuskładnikowe zostało wyłączone'],
    ['en', 'Two-factor authentication was turned off'],
  ])('mails an account that chose no locale in the sign-up locale %s', async (locale, subject) => {
    const account = await createAccount({ locale })
    addresses.push(account.email)
    const agent = await signedInAgent('portal', account.email)
    await enableMfa(agent)
    await agent.patch('/me').send({ locale: null }).expect(200)

    expect((await reset(account.email)).status).toBe(200)

    const [sent] = await waitForMail(account.email)
    expect(sent!.Subject).toBe(subject)
  })

  it('keeps the codes already used, as a record', async () => {
    const person = await personWith2fa()
    const browser = request.agent(app.getHttpServer()).set('Origin', originOf('portal'))
    await browser.post('/auth/sign-in').send({ email: person.email, password: TEST_PASSWORD })
    await browser.post('/auth/mfa/recover').send({ code: person.recoveryCodes[0] }).expect(204)
    await enableMfa(await signedInAgent('portal', person.email))
    expect(await recoveryCodeRows(person.id)).toHaveLength(11)

    expect((await reset(person.email)).status).toBe(200)

    const rows = await recoveryCodeRows(person.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.used_at).not.toBeNull()
  })

  it('takes a factor that was never verified for two-factor authentication off, and sends nothing', async () => {
    const account = await createAccount()
    addresses.push(account.email)
    await addVerifiedFactor(account.id, 'unverified')
    await addRecoveryCodeHash(account.id, 'd'.repeat(64))

    const res = await reset(account.email)

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'mfa.not-enabled' })
    expect(await mfaState(account.id)).toEqual({ mirrored: false, factors: 1 })
    expect(await recoveryCodeRows(account.id)).toHaveLength(1)
    await expect(waitForMail(account.email, 1, 500)).rejects.toThrow(/no email/)
  })

  it('never resets an admin, whatever became of the grant', async () => {
    const other = await adminAccount()
    const outdated = await adminAccount()
    await removeFactors(outdated.id)
    await addVerifiedFactor(outdated.id)

    for (const target of [other, outdated, admin]) {
      const res = await reset(target.email)

      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'account.is-admin' })
      expect(await mfaState(target.id)).toMatchObject({ mirrored: true, factors: 1 })
      expect(await loggedActions({ accountId: target.id })).not.toContainEqual(
        expect.objectContaining({ action: 'account.reset-2fa' }),
      )
    }
  })

  it('answers 400 for what is no email address', async () => {
    expect((await reset('not an address')).status).toBe(400)
  })
})

describe('GET /admin/actions', () => {
  it('lists the entries newest first, with who acted and on what', async () => {
    const tenant = await tenantWithHead()
    await asAdmin(api().post(`/admin/tenants/${tenant.id}/suspend`))
    await asAdmin(api().post(`/admin/tenants/${tenant.id}/restore`))

    const res = await asAdmin(api().get('/admin/actions').query({ limit: 2 }))

    expect(res.status).toBe(200)
    const entries = res.body as AdminAction[]
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.action)).toEqual(['tenant.restore', 'tenant.suspend'])
    expect(entries[0]).toMatchObject({
      admin: { id: admin.id, firstName: 'Ada', lastName: 'Admin', email: admin.email },
      tenant: { id: tenant.id, slug: tenant.slug },
      account: null,
    })
    expect(Date.parse(entries[0]!.createdAt)).toBeGreaterThanOrEqual(
      Date.parse(entries[1]!.createdAt),
    )
  })

  it('names no admin for a grant, which a script made', async () => {
    const granted = await adminAccount({ first_name: 'Greta' })

    const res = await asAdmin(api().get('/admin/actions').query({ limit: 20 }))

    const entry = (res.body as AdminAction[]).find(
      (candidate) => candidate.action === 'admin.grant' && candidate.account?.id === granted.id,
    )
    expect(entry).toMatchObject({
      admin: null,
      tenant: null,
      account: { id: granted.id, firstName: 'Greta', email: granted.email },
    })
  })

  it('continues before an entry, so the log reads page by page', async () => {
    const tenant = await tenantWithHead()
    for (const action of ['suspend', 'restore', 'suspend'] as const) {
      await asAdmin(api().post(`/admin/tenants/${tenant.id}/${action}`))
    }
    const first = (await asAdmin(api().get('/admin/actions').query({ limit: 1 })))
      .body as AdminAction[]

    const next = (
      await asAdmin(api().get('/admin/actions').query({ limit: 2, before: first[0]!.id }))
    ).body as AdminAction[]

    expect(first.map((entry) => entry.action)).toEqual(['tenant.suspend'])
    expect(next.map((entry) => entry.action)).toEqual(['tenant.restore', 'tenant.suspend'])
    expect(next.map((entry) => entry.id)).not.toContain(first[0]!.id)
  })

  it.each([{ limit: 0 }, { limit: 101 }, { before: 'yesterday' }, { order: 'asc' }])(
    'answers 400 for %o',
    async (query) => {
      expect((await asAdmin(api().get('/admin/actions').query(query))).status).toBe(400)
    },
  )
})

describe('the rate limit of the admin writes', () => {
  it('is one counter per admin, across the writes', async () => {
    const [busy, other] = await Promise.all([adminAccount(), adminAccount()])
    const busyToken = await sessionToken(busy.id)
    const { limit } = ROUTE_RATE_LIMITS.adminWrites
    const write = (index: number, as: string) =>
      asAdmin(api().post(`/admin/tenants/${randomUUID()}/${index % 2 ? 'suspend' : 'restore'}`), as)

    for (let index = 0; index < limit; index++) {
      expect((await write(index, busyToken)).status, String(index)).toBe(404)
    }
    const refused = await write(limit, busyToken)

    expect(refused.status).toBe(429)
    expect(refused.body).toMatchObject({ code: 'request.rate-limited' })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    expect((await write(0, await sessionToken(other.id))).status).toBe(404)
    // A read is no write: the limit leaves it alone.
    expect((await asAdmin(api().get('/admin/tenants'), busyToken)).status).toBe(200)
  })
})
