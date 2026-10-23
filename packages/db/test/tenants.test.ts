import { afterAll, describe, expect, it } from 'vitest'
import { migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'
import { createTenant } from '../src/tenants'
import { createUser, migrator, trackTenant, unique } from './db'

const db = migrationDb(migrationUrl())
afterAll(() => db.$client.end())

const slug = () => `tenant-${unique()}`

describe('createTenant', () => {
  it('creates the tenant with its head in one transaction', async () => {
    const head = await createUser()

    const tenant = await createTenant(db, {
      slug: slug(),
      name: ' Convention ',
      headEmail: head.email.toUpperCase(),
      defaultLocale: 'en',
      timezone: 'Europe/Prague',
    })
    trackTenant(tenant.id)

    const [row] = await migrator`
      select t.name, t.default_locale, t.timezone, m.account_id, m.role
      from tenants t join tenant_memberships m on m.tenant_id = t.id where t.id = ${tenant.id}
    `
    expect(row).toEqual({
      name: 'Convention',
      default_locale: 'en',
      timezone: 'Europe/Prague',
      account_id: head.id,
      role: 'head',
    })
  })

  it('refuses a taken slug and leaves the existing tenant alone', async () => {
    const head = await createUser()
    const taken = slug()
    trackTenant((await createTenant(db, { slug: taken, name: 'First', headEmail: head.email })).id)

    await expect(
      createTenant(db, { slug: taken, name: 'Second', headEmail: head.email }),
    ).rejects.toMatchObject({ code: 'tenant.slug-taken' })
    const rows = await migrator`select name from tenants where slug = ${taken}`
    expect(rows).toEqual([{ name: 'First' }])
  })

  it('refuses an unknown head email and creates nothing', async () => {
    const free = slug()

    await expect(
      createTenant(db, {
        slug: free,
        name: 'Nobody',
        headEmail: `nobody-${unique()}@example.test`,
      }),
    ).rejects.toMatchObject({ code: 'account.not-found' })
    expect(await migrator`select 1 from tenants where slug = ${free}`).toHaveLength(0)
  })

  it.each([
    [{ slug: 'Bad_Slug' }, 'tenant.slug-invalid'],
    [{ name: '  ' }, 'tenant.name-empty'],
    [{ defaultLocale: 'cs' }, 'tenant.locale-invalid'],
    [{ timezone: 'Mars/Olympus' }, 'tenant.timezone-invalid'],
  ])('refuses %o with %s', async (override, code) => {
    await expect(
      createTenant(db, { slug: slug(), name: 'X', headEmail: 'x@example.test', ...override }),
    ).rejects.toMatchObject({ code })
  })
})
