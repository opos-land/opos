import { afterAll, describe, expect, it } from 'vitest'
import { adminDb, migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'
import {
  createTenant,
  deleteTenant,
  renameTenant,
  restoreTenant,
  suspendTenant,
} from '../src/tenants'
import { adminPassword, createUser, migrator, trackTenant, unique, url } from './db'

// The tenant functions run as the roles that call them: opos_admin behind the admin routes, and
// postgres in the seed and the fixtures.
const pools = {
  opos_admin: adminDb(url('opos_admin', adminPassword), { max: 2 }),
  postgres: migrationDb(migrationUrl(), { max: 2 }),
}
afterAll(() => Promise.all(Object.values(pools).map((db) => db.$client.end())))

const slug = () => `tenant-${unique()}`
const missing = '00000000-0000-4000-8000-000000000000'

class Rollback extends Error {}

describe.each(Object.entries(pools))('as %s', (_, db) => {
  const tenant = async () => {
    const head = await createUser()
    const created = await createTenant(db, { slug: slug(), name: 'Tenant', headEmail: head.email })
    trackTenant(created.id)
    return created
  }
  const row = async (id: string) =>
    (
      await migrator<{ slug: string; suspended_at: Date | null }[]>`
        select slug, suspended_at from tenants where id = ${id}
      `
    )[0]

  describe('createTenant', () => {
    it('creates the tenant with its head in one transaction', async () => {
      const head = await createUser()

      const created = await createTenant(db, {
        slug: slug(),
        name: ' Convention ',
        headEmail: head.email.toUpperCase(),
        defaultLocale: 'en',
        timezone: 'Europe/Prague',
      })
      trackTenant(created.id)

      const [found] = await migrator`
        select t.name, t.default_locale, t.timezone, t.suspended_at, m.account_id, m.role
        from tenants t join tenant_memberships m on m.tenant_id = t.id where t.id = ${created.id}
      `
      expect(found).toEqual({
        name: 'Convention',
        default_locale: 'en',
        timezone: 'Europe/Prague',
        suspended_at: null,
        account_id: head.id,
        role: 'head',
      })
      expect(created.headAccountId).toBe(head.id)
    })

    it('refuses a taken slug and leaves the existing tenant alone', async () => {
      const head = await createUser()
      const taken = slug()
      trackTenant(
        (await createTenant(db, { slug: taken, name: 'First', headEmail: head.email })).id,
      )

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

    it('refuses a head whose email is not confirmed and creates nothing', async () => {
      const head = await createUser({}, { confirmed: false })
      const free = slug()

      await expect(
        createTenant(db, { slug: free, name: 'Unconfirmed', headEmail: head.email }),
      ).rejects.toMatchObject({ code: 'account.unconfirmed' })
      expect(await migrator`select 1 from tenants where slug = ${free}`).toHaveLength(0)
    })

    it.each([
      [{ slug: 'Bad_Slug' }, 'tenant.slug-invalid'],
      [{ slug: 'panel' }, 'tenant.slug-reserved'],
      // The panel's account page.
      [{ slug: 'account' }, 'tenant.slug-reserved'],
      [{ name: '  ' }, 'tenant.name-empty'],
      [{ defaultLocale: 'cs' }, 'tenant.locale-invalid'],
      [{ timezone: 'Mars/Olympus' }, 'tenant.timezone-invalid'],
    ])('refuses %o with %s', async (override, code) => {
      await expect(
        createTenant(db, { slug: slug(), name: 'X', headEmail: 'x@example.test', ...override }),
      ).rejects.toMatchObject({ code })
    })

    it('refuses the slug of a deleted tenant', async () => {
      const gone = await tenant()
      await suspendTenant(db, gone.id)
      await deleteTenant(db, gone.id)
      const head = await createUser()

      await expect(
        createTenant(db, { slug: gone.slug, name: 'Heir', headEmail: head.email }),
      ).rejects.toMatchObject({ code: 'tenant.slug-retired' })
      expect(await migrator`select 1 from tenants where slug = ${gone.slug}`).toHaveLength(0)
    })

    // The insert waits on the unique index for the deletion to commit and is then refused by
    // the slug it retired, not by a conflict.
    it('refuses the slug of a tenant whose deletion is still open', async () => {
      const gone = await tenant()
      const head = await createUser()
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      let deleted!: () => void
      const deleting = new Promise<void>((resolve) => (deleted = resolve))

      const deletion = migrator.begin(async (sql) => {
        await sql`delete from tenants where id = ${gone.id}`
        deleted()
        await held
      })
      await deleting
      let settled = false
      const creation = createTenant(db, { slug: gone.slug, name: 'Heir', headEmail: head.email })
        .catch((error: unknown) => error)
        .finally(() => (settled = true))
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(settled).toBe(false)
      release()
      await deletion

      expect(await creation).toMatchObject({ code: 'tenant.slug-retired' })
      expect(await migrator`select 1 from tenants where slug = ${gone.slug}`).toHaveLength(0)
    })

    it('creates the tenant in the transaction of its caller, and goes with it', async () => {
      const head = await createUser()
      const free = slug()

      await db
        .transaction(async (tx) => {
          const created = await createTenant(tx, {
            slug: free,
            name: 'Held',
            headEmail: head.email,
          })
          expect(created.slug).toBe(free)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })

      expect(await migrator`select 1 from tenants where slug = ${free}`).toHaveLength(0)
    })
  })

  describe('renameTenant', () => {
    it('moves the tenant to the new slug, found by its identifier or its slug', async () => {
      const { id, slug: current } = await tenant()
      const [next, last] = [slug(), slug()]

      expect(await renameTenant(db, { id, newSlug: next })).toEqual({ id, slug: next })
      expect((await row(id))?.slug).toBe(next)
      expect(await renameTenant(db, { slug: next, newSlug: last })).toEqual({ id, slug: last })
      expect((await row(id))?.slug).toBe(last)
      // The slug a tenant left is free at once.
      const head = await createUser()
      trackTenant(
        (await createTenant(db, { slug: current, name: 'Next', headEmail: head.email })).id,
      )
    })

    it('refuses a slug taken by another tenant and changes nothing', async () => {
      const [first, second] = await Promise.all([tenant(), tenant()])

      await expect(renameTenant(db, { id: first.id, newSlug: second.slug })).rejects.toMatchObject({
        code: 'tenant.slug-taken',
      })
      expect((await row(first.id))?.slug).toBe(first.slug)
    })

    it('refuses an unknown tenant, a malformed slug and a reserved one', async () => {
      const { id, slug: current } = await tenant()

      await expect(
        renameTenant(db, { slug: `missing-${unique()}`, newSlug: slug() }),
      ).rejects.toMatchObject({ code: 'tenant.not-found' })
      await expect(renameTenant(db, { id: missing, newSlug: slug() })).rejects.toMatchObject({
        code: 'tenant.not-found',
      })
      await expect(renameTenant(db, { id, newSlug: 'Bad_Slug' })).rejects.toMatchObject({
        code: 'tenant.slug-invalid',
      })
      await expect(renameTenant(db, { id, newSlug: 'scanner' })).rejects.toMatchObject({
        code: 'tenant.slug-reserved',
      })
      expect((await row(id))?.slug).toBe(current)
    })

    it('refuses the slug of a deleted tenant and changes nothing', async () => {
      const [kept, gone] = await Promise.all([tenant(), tenant()])
      await suspendTenant(db, gone.id)
      await deleteTenant(db, gone.id)

      await expect(renameTenant(db, { id: kept.id, newSlug: gone.slug })).rejects.toMatchObject({
        code: 'tenant.slug-retired',
      })
      expect((await row(kept.id))?.slug).toBe(kept.slug)
    })
  })

  describe('suspendTenant and restoreTenant', () => {
    it('suspends a tenant once and restores it once', async () => {
      const { id, slug: current } = await tenant()

      expect(await suspendTenant(db, id)).toEqual({ id, slug: current, changed: true })
      const suspendedAt = (await row(id))?.suspended_at
      expect(suspendedAt).toBeInstanceOf(Date)
      // Suspending a suspended tenant changes nothing, the moment it was suspended included.
      expect(await suspendTenant(db, id)).toEqual({ id, slug: current, changed: false })
      expect((await row(id))?.suspended_at).toEqual(suspendedAt)

      expect(await restoreTenant(db, id)).toEqual({ id, slug: current, changed: true })
      expect((await row(id))?.suspended_at).toBeNull()
      expect(await restoreTenant(db, id)).toEqual({ id, slug: current, changed: false })
    })

    it('leaves everything the tenant owns as it was', async () => {
      const { id, headAccountId } = await tenant()
      const [edition] = await migrator<{ id: string }[]>`
        insert into editions (tenant_id, slug, name, starts_at, ends_at)
        values (${id}, 'kept', 'Kept', '2026-06-01', '2026-06-03') returning id
      `

      await suspendTenant(db, id)
      await restoreTenant(db, id)

      expect(await migrator`select id from editions where tenant_id = ${id}`).toEqual([
        { id: edition!.id },
      ])
      expect(
        await migrator`select account_id, role from tenant_memberships where tenant_id = ${id}`,
      ).toEqual([{ account_id: headAccountId, role: 'head' }])
    })

    it('refuses an unknown tenant', async () => {
      await expect(suspendTenant(db, missing)).rejects.toMatchObject({ code: 'tenant.not-found' })
      await expect(restoreTenant(db, missing)).rejects.toMatchObject({ code: 'tenant.not-found' })
    })
  })

  describe('deleteTenant', () => {
    it('deletes a suspended tenant with everything it owns, and leaves the accounts', async () => {
      const { id, slug: current, headAccountId } = await tenant()
      const [edition] = await migrator<{ id: string }[]>`
        insert into editions (tenant_id, slug, name, starts_at, ends_at)
        values (${id}, 'last', 'Last', '2026-06-01', '2026-06-03') returning id
      `
      const [item] = await migrator<{ id: string }[]>`
        insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
        values (${id}, ${edition!.id}, 'Item', '2026-06-01 10:00Z', '2026-06-01 11:00Z')
        returning id
      `
      await migrator`
        insert into program_item_likes (tenant_id, program_item_id, account_id)
        values (${id}, ${item!.id}, ${headAccountId})
      `
      await suspendTenant(db, id)

      expect(await deleteTenant(db, id)).toEqual({ id, slug: current })

      for (const table of [
        'tenant_memberships',
        'editions',
        'program_items',
        'program_item_likes',
      ]) {
        expect(
          await migrator`select 1 from ${migrator(table)} where tenant_id = ${id}`,
          table,
        ).toHaveLength(0)
      }
      expect(await row(id)).toBeUndefined()
      expect(await migrator`select 1 from accounts where id = ${headAccountId}`).toHaveLength(1)
    })

    it('refuses a tenant that is not suspended and deletes nothing', async () => {
      const { id } = await tenant()

      await expect(deleteTenant(db, id)).rejects.toMatchObject({ code: 'tenant.not-suspended' })
      expect(await row(id)).toBeDefined()
    })

    it('refuses an unknown tenant', async () => {
      await expect(deleteTenant(db, missing)).rejects.toMatchObject({ code: 'tenant.not-found' })
    })

    // The deletion waits for the restore and then judges the row again: one statement both
    // checks the suspension and deletes.
    it('refuses a tenant restored by a transaction still open when the deletion starts', async () => {
      const { id } = await tenant()
      await suspendTenant(db, id)
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      let locked!: () => void
      const restoring = new Promise<void>((resolve) => (locked = resolve))

      const restore = migrator.begin(async (sql) => {
        await sql`update tenants set suspended_at = null where id = ${id}`
        locked()
        await held
      })
      await restoring
      let settled = false
      const deletion = deleteTenant(db, id)
        .catch((error: unknown) => error)
        .finally(() => (settled = true))
      // Long enough for the deletion to reach the row lock, where it waits.
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(settled).toBe(false)
      release()
      await restore

      expect(await deletion).toMatchObject({ code: 'tenant.not-suspended' })
      expect(await row(id)).toMatchObject({ suspended_at: null })
    })

    it('rolls back with the transaction of its caller', async () => {
      const { id } = await tenant()
      await suspendTenant(db, id)

      await db
        .transaction(async (tx) => {
          await deleteTenant(tx, id)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })

      expect(await row(id)).toBeDefined()
    })
  })
})
