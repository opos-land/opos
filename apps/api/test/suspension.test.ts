import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract, type ContractMeta } from '@opos/contract'
import {
  type AnyContractProcedure,
  type AnyContractRouter,
  isContractProcedure,
} from '@orpc/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { invitationKey, signInvitation } from '../src/modules/tenants/invitation-token'
import { createApp } from './app'
import {
  createAccount,
  deleteCreatedAccounts,
  session,
  sessionHeaders,
  signIn,
  testEmail,
} from './auth'
import {
  addEdition,
  addLike,
  addOrg,
  addProgramItem,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  restore,
  storedMembership,
  suspend,
  tenantState,
  tenantWithHead,
} from './tenants'

// A suspended tenant is off for everyone but the admin
// (docs/adr/0031-suspend-a-tenant-before-deleting-it.md): no tenant transaction opens on it,
// whether the tenant comes from the request's header, from a token or from an address, and the
// account's own cross-tenant reads leave what it owns out. Restored, all of it is back.

const tenantRoutes = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) => {
    if (!isContractProcedure(value)) return tenantRoutes(value, `${prefix}${key}.`)
    const meta = value['~orpc'].meta as ContractMeta
    return meta.tenant ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]] : []
  })

const key = invitationKey(loadEnv().INVITE_SECRET)

let app: NestExpressApplication
let off: Awaited<ReturnType<typeof tenantWithHead>>
let on: Awaited<ReturnType<typeof tenantWithHead>>
let both: Member
let fan: Member
let edition: { off: string; on: string }
let item: { off: string; on: string }
let invitation: string
let invited: Member

const api = () => request(app.getHttpServer())

const inTenant = (who: Member, slug: string) => (req: request.Test) => {
  req.set({ ...sessionHeaders(who.token), 'X-Tenant-Slug': slug })
}

beforeAll(async () => {
  app = await createApp()
  ;[off, on, both, fan] = await Promise.all([
    tenantWithHead(),
    tenantWithHead(),
    member(),
    member(),
  ])
  const editions = await Promise.all(
    [off, on].map((tenant) =>
      addEdition(tenant.id, { slug: '2027', isPublished: true, isActive: true }),
    ),
  )
  edition = { off: editions[0]!, on: editions[1]! }
  const items = await Promise.all([
    addProgramItem(off.id, edition.off),
    addProgramItem(on.id, edition.on),
  ])
  item = { off: items[0], on: items[1] }
  await Promise.all([addLike(off.id, item.off, fan.id), addLike(on.id, item.on, fan.id)])
  const account = await createAccount({}, { email: testEmail('suspended') })
  invited = { ...account, token: await signIn(account.email) }
  const sender = (await storedMembership(off.id, off.head.id))!.id
  invitation = (
    await signInvitation(
      {
        tenantId: off.id,
        email: account.email,
        role: 'org',
        tenantPermissions: {
          settingsAccess: 'read',
          brandingAccess: 'none',
          shopConfigAccess: 'none',
        },
        editionPermissions: [],
        expiresAt: null,
        invitedBy: sender,
      },
      key,
    )
  ).token
  // One account in both teams: its memberships show one convention suspended and one not.
  await Promise.all([addOrg(off.id, both), addOrg(on.id, both)])
  await suspend(off.id)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

describe('a suspended tenant', () => {
  const routes = tenantRoutes(contract)

  it.each(routes)('%s answers 403 tenant.suspended to its head', async (_, procedure) => {
    const before = await tenantState(off.id)
    const { method = 'GET', path = '/' } = procedure['~orpc'].route
    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    const agent = api()
    const res = await agent[verb](path.replace(/\{[^}]+\}/g, edition.off))
      .use(inTenant(off.head, off.slug))
      .send({})

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'tenant.suspended' })
    expect(await tenantState(off.id)).toEqual(before)
  })

  it('answers the same to an account outside its team, before any membership is read', async () => {
    const res = await api().get('/tenants/current').use(inTenant(fan, off.slug))

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'tenant.suspended' })
  })

  it.each([
    ['its page', () => `/public/tenants/${off.slug}`],
    ['its editions', () => `/public/tenants/${off.slug}/editions`],
    ['its active edition', () => `/public/tenants/${off.slug}/active-edition`],
    ['an edition', () => `/public/tenants/${off.slug}/editions/2027`],
    ['a programme', () => `/public/tenants/${off.slug}/editions/2027/program-items`],
    [
      'a programme item',
      () => `/public/tenants/${off.slug}/editions/2027/program-items/${item.off}`,
    ],
  ])('answers 404 for %s, as for an unknown address', async (_, path) => {
    const res = await api().get(path())
    const unknown = await api().get(path().replace(off.slug, `missing-${randomUUID().slice(0, 8)}`))

    expect(res.status).toBe(404)
    expect(res.body).toEqual(unknown.body)
  })

  it('refuses the preview and the acceptance of an invitation to it', async () => {
    const preview = await api().get('/invitations/preview').query({ token: invitation })
    expect(preview.status).toBe(403)
    expect(preview.body).toMatchObject({ code: 'tenant.suspended' })

    const accepted = await api()
      .post('/invitations/accept')
      .use(session(invited.token))
      .send({ token: invitation })
    expect(accepted.status).toBe(403)
    expect(accepted.body).toMatchObject({ code: 'tenant.suspended' })
    expect(await storedMembership(off.id, invited.id)).toBeUndefined()
  })

  it('shows as suspended among the memberships, with no edition', async () => {
    const res = await api().get('/me/memberships').use(session(both.token))

    expect(res.status).toBe(200)
    const bySlug = Object.fromEntries(
      (res.body as { tenant: { slug: string; suspended: boolean }; editions: unknown[] }[]).map(
        (membership) => [membership.tenant.slug, membership],
      ),
    )
    expect(bySlug[off.slug]).toMatchObject({ tenant: { suspended: true }, editions: [] })
    expect(bySlug[on.slug]).toMatchObject({ tenant: { suspended: false } })
  })

  it('leaves its programme items out of a personal schedule', async () => {
    const res = await api().get('/me/schedule').use(session(fan.token))

    expect(res.status).toBe(200)
    expect((res.body as { id: string }[]).map((entry) => entry.id)).toEqual([item.on])
  })

  it('leaves another tenant as it was', async () => {
    const res = await api().get('/tenants/current').use(inTenant(on.head, on.slug))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ slug: on.slug })
  })
})

describe('a restored tenant', () => {
  beforeAll(() => restore(off.id))

  it('answers its organizers again', async () => {
    const res = await api().get('/tenants/current').use(inTenant(off.head, off.slug))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ slug: off.slug })
  })

  it('has its page and its programme back', async () => {
    const page = await api().get(`/public/tenants/${off.slug}`)
    expect(page.status).toBe(200)
    const items = await api().get(`/public/tenants/${off.slug}/editions/2027/program-items`)
    expect(items.status).toBe(200)
    expect((items.body as { id: string }[]).map((entry) => entry.id)).toEqual([item.off])
  })

  it('is back in the schedule and among the memberships', async () => {
    const schedule = await api().get('/me/schedule').use(session(fan.token))
    expect((schedule.body as { id: string }[]).map((entry) => entry.id).sort()).toEqual(
      [item.off, item.on].sort(),
    )
    const memberships = await api().get('/me/memberships').use(session(both.token))
    expect(
      (memberships.body as { tenant: { suspended: boolean } }[]).map(
        (membership) => membership.tenant.suspended,
      ),
    ).toEqual([false, false])
  })

  it('previews the invitation again', async () => {
    const preview = await api().get('/invitations/preview').query({ token: invitation })

    expect(preview.status).toBe(200)
  })
})
