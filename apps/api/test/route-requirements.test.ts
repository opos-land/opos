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
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  tenantWithHead,
} from './tenants'

// Every route of the contract, checked against the permission it needs (PLAN.md 5, 7.3). A route
// missing from the tables below fails the coverage tests, so a new route is written down here,
// with its permission, before it can pass.

type Level = 'read' | 'write'
type Need =
  | { scope: 'member' }
  | { scope: 'tenant'; resource: 'settings' | 'branding' | 'shop'; level: Level }
  | { scope: 'edition'; resource: 'program' | 'websiteContent' | 'tickets'; level: Level }

const anyMember: Need = { scope: 'member' }
const settings = (level: Level): Need => ({ scope: 'tenant', resource: 'settings', level })

/** Tenant routes and what each needs; a head passes every one (PRODUCT.md 5). */
const tenantRequirements: Record<string, Need> = {
  'tenants.current': anyMember,
  'tenants.update': settings('write'),
  'tenants.members.list': settings('read'),
  'tenants.members.invite': settings('write'),
  'tenants.members.update': settings('write'),
  'tenants.members.remove': settings('write'),
  'editions.list': anyMember,
  'editions.create': settings('write'),
  'editions.get': anyMember,
  'editions.update': settings('write'),
  'editions.remove': settings('write'),
  'editions.activate': settings('write'),
  'editions.members.list': settings('read'),
  'editions.members.put': settings('write'),
  'editions.members.remove': settings('write'),
}

/** Routes without sign-in; every other route that is not a tenant route needs an account. */
const publicRoutes = ['health.check', 'invitations.preview']

const procedures = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) =>
    isContractProcedure(value)
      ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]]
      : procedures(value, `${prefix}${key}.`),
  )

const isTenantRoute = (procedure: AnyContractProcedure) =>
  (procedure['~orpc'].meta as ContractMeta).tenant === true

/** publicRoute documents `security: []`, the OpenAPI mark of a route without sign-in. */
function isPublicRoute(procedure: AnyContractProcedure) {
  const { spec } = procedure['~orpc'].route
  const operation = typeof spec === 'function' ? spec({ responses: {} }) : spec
  return Array.isArray(operation?.security) && operation.security.length === 0
}

const all = procedures(contract)
const tenantRoutes = all.filter(([, procedure]) => isTenantRoute(procedure))
const accountRoutes = all.filter(
  ([, procedure]) => !isTenantRoute(procedure) && !isPublicRoute(procedure),
)

let app: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let editionA: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  editionA = await addEdition(a.id)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * Calls a route with an empty body. `:editionId` is edition A for a route with an edition-level
 * need, so the edition permission is what decides; every other path id is random, so a request
 * the check lets through ends in a 404 or a 400 and changes no fixture.
 */
function call(
  procedure: AnyContractProcedure,
  need: Need | undefined,
  who?: Member,
  slug = a.slug,
) {
  const { method = 'GET', path = '/' } = procedure['~orpc'].route
  const target = path.replace(/\{([^}]+)\}/g, (_, param: string) =>
    param === 'editionId' && need?.scope === 'edition' ? editionA : randomUUID(),
  )
  const verb = method.toLowerCase() as Method
  let req = request(app.getHttpServer())[verb](target).set('X-Tenant-Slug', slug)
  if (who) req = req.set('Authorization', `Bearer ${who.token}`)
  return verb === 'get' ? req : req.send({})
}

const below = (level: Level) => (level === 'write' ? 'read' : 'none')
const tenantWrite = { settings: 'write', branding: 'write', shop: 'write' } as const
const editionWrite = { program: 'write', websiteContent: 'write', tickets: 'write' } as const

/** An org of tenant A holding the given permissions; edition ones apply to edition A. */
async function org(
  tenant: Partial<Record<keyof typeof tenantWrite, 'none' | Level>> = {},
  edition?: Partial<Record<keyof typeof editionWrite, 'none' | Level>>,
) {
  const who = await member()
  const id = await addOrg(a.id, who, tenant)
  if (edition) await addEditionAccess(a.id, id, editionA, edition)
  return who
}

/** One level short of the need, with every other permission at write. */
function short(need: Exclude<Need, { scope: 'member' }>) {
  return need.scope === 'tenant'
    ? org({ ...tenantWrite, [need.resource]: below(need.level) }, editionWrite)
    : org(tenantWrite, { ...editionWrite, [need.resource]: below(need.level) })
}

/** Exactly the need and nothing else. */
function exactly(need: Need) {
  if (need.scope === 'member') return org()
  return need.scope === 'tenant'
    ? org({ [need.resource]: need.level })
    : org({}, { [need.resource]: need.level })
}

describe('contract coverage', () => {
  it('names the requirement of every tenant route', () => {
    expect(tenantRoutes.map(([name]) => name).sort()).toEqual(
      Object.keys(tenantRequirements).sort(),
    )
  })

  it('lists every route without sign-in', () => {
    const open = all.filter(([, procedure]) => isPublicRoute(procedure)).map(([name]) => name)
    expect(open.sort()).toEqual([...publicRoutes].sort())
  })
})

describe('account routes', () => {
  it.each(accountRoutes)('%s refuses a request without a token', async (_, procedure) => {
    const res = await call(procedure, undefined)
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })
})

describe('tenant routes', () => {
  const routes = tenantRoutes.map(
    ([name, procedure]) => [name, procedure, tenantRequirements[name]!] as const,
  )

  it.each(routes)('%s refuses a request without a token', async (_, procedure, need) => {
    const res = await call(procedure, need)
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it.each(routes)(
    '%s refuses an outsider, a head of another tenant and an expired org holding everything',
    async (_, procedure, need) => {
      const outsider = await member()
      const lapsed = await member()
      const id = await addOrg(a.id, lapsed, { ...tenantWrite, expired: true })
      await addEditionAccess(a.id, id, editionA, editionWrite)

      for (const [who, label] of [
        [outsider, 'outsider'],
        [b.head, 'head of another tenant'],
        [lapsed, 'expired org'],
      ] as const) {
        const res = await call(procedure, need, who)
        expect(res.status, label).toBe(403)
        expect(res.body, label).toMatchObject({ code: 'permission.denied' })
      }
    },
  )

  it.each(routes.filter(([, , need]) => need.scope !== 'member'))(
    '%s refuses an org one level short of what it needs',
    async (_, procedure, need) => {
      const res = await call(
        procedure,
        need,
        await short(need as Exclude<Need, { scope: 'member' }>),
      )
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'permission.denied' })
    },
  )

  it.each(routes)(
    '%s lets an org with exactly what it needs and a head through',
    async (_, procedure, need) => {
      for (const [who, label] of [
        [await exactly(need), 'org'],
        [a.head, 'head'],
      ] as const) {
        const res = await call(procedure, need, who)
        expect([401, 403], `${label}: ${JSON.stringify(res.body)}`).not.toContain(res.status)
      }
    },
  )
})
