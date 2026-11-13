import {
  type AnyContractProcedure,
  type AnyContractRouter,
  isContractProcedure,
} from '@orpc/contract'
import { describe, expect, it } from 'vitest'
import { adminContract, createTenantSchema, renameTenantSchema, tenantSlug } from './admin'
import { type ContractMeta } from './common'
import { contract } from './index'

const procedures = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) =>
    isContractProcedure(value)
      ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]]
      : procedures(value, `${prefix}${key}.`),
  )

const isAdmin = (procedure: AnyContractProcedure) =>
  (procedure['~orpc'].meta as ContractMeta).admin === true
const pathOf = (procedure: AnyContractProcedure) => procedure['~orpc'].route.path ?? '/'

// The API serves `/admin/` to the admin application's origin alone and guards every admin route
// by its mark, so the mark and the path must name the same routes.
describe('admin routes', () => {
  const all = procedures(contract)

  it('are the routes of the admin contract, and no other', () => {
    expect(
      all
        .filter(([, procedure]) => isAdmin(procedure))
        .map(([name]) => name)
        .sort(),
    ).toEqual(
      Object.keys(adminContract)
        .map((name) => `admin.${name}`)
        .sort(),
    )
  })

  it.each(all)('%s is under /admin/ exactly when it is an admin route', (_, procedure) => {
    expect(pathOf(procedure).startsWith('/admin/')).toBe(isAdmin(procedure))
  })

  it('offer no way to grant the admin role or to take it away', () => {
    const paths = Object.values(adminContract).map((procedure) => pathOf(procedure))

    expect(paths.filter((path) => /grant|revoke|admins/.test(path))).toEqual([])
  })
})

describe('tenantSlug', () => {
  it.each(['abc', 'convention-a', 'a'.repeat(40), '2026'])('takes %s', (slug) => {
    expect(tenantSlug.safeParse(slug).success).toBe(true)
  })

  it.each(['ab', 'a'.repeat(41), 'Convention', 'with space', 'with_underscore', ''])(
    'refuses %j',
    (slug) => {
      expect(tenantSlug.safeParse(slug).success).toBe(false)
    },
  )
})

describe('createTenantSchema', () => {
  const valid = {
    name: 'Convention A',
    slug: 'convention-a',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@example.test',
  }

  it('takes a tenant with its first head', () => {
    expect(createTenantSchema.parse({ ...valid, name: '  Convention A ' })).toEqual(valid)
  })

  it.each([
    ['an empty name', { name: '  ' }],
    ['a malformed slug', { slug: 'Bad_Slug' }],
    ['an unsupported language', { defaultLocale: 'cs' }],
    ['an unknown time zone', { timezone: 'Mars/Olympus' }],
    ['what is no email address', { headEmail: 'head' }],
    ['a field of its own making', { suspendedAt: '2026-01-01T00:00:00Z' }],
  ])('refuses %s', (_, override) => {
    expect(createTenantSchema.safeParse({ ...valid, ...override }).success).toBe(false)
  })
})

describe('renameTenantSchema', () => {
  it('takes the new slug and nothing else', () => {
    expect(renameTenantSchema.safeParse({ slug: 'convention-b' }).success).toBe(true)
    expect(renameTenantSchema.safeParse({ slug: 'convention-b', name: 'B' }).success).toBe(false)
  })
})
