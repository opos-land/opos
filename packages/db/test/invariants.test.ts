import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { migrationUrl } from '../src/migration-url'
import { RESERVED_TENANT_SLUGS } from '../src/schema'
import {
  authAdmin,
  createEdition,
  createProgramItem,
  createTenant,
  createUser,
  migrator,
  unique,
} from './db'

describe('invariants', () => {
  it('allows one active edition per tenant', async () => {
    const tenant = await createTenant()
    await createEdition(tenant.id, { isActive: true })

    await expect(createEdition(tenant.id, { isActive: true })).rejects.toThrow(
      /editions_one_active_unique/,
    )
  })

  it('switches the active edition inside one transaction', async () => {
    const tenant = await createTenant()
    const current = await createEdition(tenant.id, { isActive: true })
    const next = await createEdition(tenant.id)

    await migrator.begin(async (sql) => {
      await sql`update editions set is_active = false where id = ${current}`
      await sql`update editions set is_active = true where id = ${next}`
    })

    const active = await migrator<
      { id: string }[]
    >`select id from editions where tenant_id = ${tenant.id} and is_active`
    expect(active.map((r) => r.id)).toEqual([next])
  })

  it('refuses to remove the last head', async () => {
    const tenant = await createTenant()

    await expect(
      migrator`delete from tenant_memberships where account_id = ${tenant.headId}`,
    ).rejects.toThrow(/tenant_memberships_at_least_one_head|at least one head/)
    await expect(
      migrator`update tenant_memberships set role = 'org' where account_id = ${tenant.headId}`,
    ).rejects.toThrow(/at least one head/)
  })

  it('refuses a tenant created without a head', async () => {
    const org = await createUser()

    await expect(
      migrator`insert into tenants (slug, name) values (${`tenant-${unique()}`}, 'No head')`,
    ).rejects.toThrow(/tenants_at_least_one_head|created with a head/)
    await expect(
      migrator.begin(async (sql) => {
        const [tenant] = await sql<{ id: string }[]>`
          insert into tenants (slug, name) values (${`tenant-${unique()}`}, 'Org only') returning id
        `
        await sql`
          insert into tenant_memberships (account_id, tenant_id, role) values (${org.id}, ${tenant!.id}, 'org')
        `
      }),
    ).rejects.toThrow(/created with a head/)
  })

  it('keeps a head when two transactions demote different heads at once', async () => {
    const tenant = await createTenant()
    const second = await createUser()
    await migrator`
      insert into tenant_memberships (account_id, tenant_id, role) values (${second.id}, ${tenant.id}, 'head')
    `
    const first = postgres(migrationUrl(), { max: 1, onnotice: () => {} })
    const other = postgres(migrationUrl(), {
      max: 1,
      onnotice: () => {},
      connection: { application_name: 'opos-test-demote' },
    })
    const a = await first.reserve()
    const b = await other.reserve()

    try {
      // Both transactions demote a head and run the deferred check before either commits.
      await a`begin`
      await a`update tenant_memberships set role = 'org' where account_id = ${tenant.headId}`
      await a`set constraints tenant_memberships_at_least_one_head immediate`
      await b`begin`
      await b`update tenant_memberships set role = 'org' where account_id = ${second.id}`
      let checked = false
      const checkB = b`set constraints tenant_memberships_at_least_one_head immediate`.execute()
      checkB.then(
        () => (checked = true),
        () => (checked = true),
      )

      // The second check waits for the tenant lock held by the first transaction.
      for (let i = 0; i < 50 && !checked; i++) {
        const [waiting] = await migrator<{ count: number }[]>`
          select count(*)::int as count from pg_stat_activity
          where application_name = 'opos-test-demote' and wait_event_type = 'Lock'
        `
        if (waiting!.count > 0) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      await a`commit`

      await expect(checkB).rejects.toThrow(/at least one head/)
    } finally {
      await Promise.all([a`rollback`, b`rollback`])
      a.release()
      b.release()
      await Promise.all([first.end(), other.end()])
    }

    const heads = await migrator`
      select 1 from tenant_memberships where tenant_id = ${tenant.id} and role = 'head'
    `
    expect(heads).toHaveLength(1)
  })

  it('refuses to delete the account of the last head', async () => {
    const tenant = await createTenant()

    await expect(migrator`delete from accounts where id = ${tenant.headId}`).rejects.toThrow(
      /at least one head/,
    )
  })

  it('hands the head role over in either order inside one transaction', async () => {
    const tenant = await createTenant()
    const next = await createUser()
    await migrator`
      insert into tenant_memberships (account_id, tenant_id, role) values (${next.id}, ${tenant.id}, 'org')
    `

    await migrator.begin(async (sql) => {
      await sql`update tenant_memberships set role = 'org' where account_id = ${tenant.headId}`
      await sql`update tenant_memberships set role = 'head' where account_id = ${next.id}`
    })

    const heads = await migrator<{ account_id: string }[]>`
      select account_id from tenant_memberships where tenant_id = ${tenant.id} and role = 'head'
    `
    expect(heads.map((r) => r.account_id)).toEqual([next.id])
  })

  it('deletes a tenant together with its memberships', async () => {
    const tenant = await createTenant()

    await migrator`delete from tenants where id = ${tenant.id}`

    const left = await migrator`select 1 from tenant_memberships where tenant_id = ${tenant.id}`
    expect(left).toHaveLength(0)
  })

  it('refuses an expiry on a head membership', async () => {
    const tenant = await createTenant()

    await expect(
      migrator`update tenant_memberships set expires_at = now() where account_id = ${tenant.headId}`,
    ).rejects.toThrow(/tenant_memberships_head_never_expires/)
  })

  it('refuses a tenant-level permission on a head membership', async () => {
    const tenant = await createTenant()

    await expect(
      migrator`update tenant_memberships set branding_access = 'read' where account_id = ${tenant.headId}`,
    ).rejects.toThrow(/tenant_memberships_head_holds_no_levels/)
  })

  it('refuses an edition membership pointing at another tenant', async () => {
    const a = await createTenant()
    const b = await createTenant()
    const foreignEdition = await createEdition(b.id)
    const [membership] = await migrator<{ id: string }[]>`
      select id from tenant_memberships where tenant_id = ${a.id}
    `

    await expect(
      migrator`
        insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
        values (${a.id}, ${membership!.id}, ${foreignEdition})
      `,
    ).rejects.toThrow(/edition_memberships_edition_fk/)
  })

  it('moves updated_at on every update', async () => {
    const tenant = await createTenant()

    // Compared in Postgres: a JS Date drops the microseconds, and both can share a millisecond.
    const [row] = await migrator<{ moved: boolean }[]>`
      update tenants set name = 'Renamed' where id = ${tenant.id}
      returning updated_at > created_at as moved
    `
    expect(row!.moved).toBe(true)
  })

  it.each(RESERVED_TENANT_SLUGS)('refuses the reserved word %s as a slug', async (slug) => {
    // The transaction rolls back should the check let the word through.
    const inserted = migrator.begin(async (tx) => {
      await tx`insert into tenants (slug, name) values (${slug}, 'Reserved')`
      throw new Error(`the slug ${slug} was accepted`)
    })

    await expect(inserted).rejects.toThrow(/tenants_slug_not_reserved/)
  })

  it('refuses a slug outside the allowed format', async () => {
    await expect(
      migrator`insert into tenants (slug, name) values (${`Bad_${randomUUID().slice(0, 4)}`}, 'Bad')`,
    ).rejects.toThrow(/tenants_slug_format/)
  })

  it.each(['Edition_2027', '', 'a'.repeat(41)])('refuses %j as an edition slug', async (slug) => {
    const tenant = await createTenant()

    await expect(
      migrator`
          insert into editions (tenant_id, slug, name, starts_at, ends_at)
          values (${tenant.id}, ${slug}, 'Bad', '2026-06-01', '2026-06-03')
        `,
    ).rejects.toThrow(/editions_slug_format/)
  })
})

describe('programme items', () => {
  // A speaker and a like share one shape: a programme item and an account, once per pair.
  const itemAccountTables = ['program_item_speakers', 'program_item_likes'] as const

  const addToItem = (
    table: (typeof itemAccountTables)[number],
    tenantId: string,
    itemId: string,
    accountId: string,
  ) =>
    migrator.unsafe(
      `insert into ${table} (tenant_id, program_item_id, account_id)
       values ('${tenantId}', '${itemId}', '${accountId}')`,
    )

  const countOn = async (table: string, column: string, id: string) =>
    (
      await migrator.unsafe<{ count: number }[]>(
        `select count(*)::int as count from ${table} where ${column} = '${id}'`,
      )
    )[0]!.count

  it('refuses a programme item in an edition of another tenant', async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()])
    const foreignEdition = await createEdition(b.id)

    await expect(createProgramItem(a.id, foreignEdition)).rejects.toThrow(
      /program_items_edition_fk/,
    )
  })

  it('refuses a programme item that does not end after it starts', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)

    await expect(
      migrator`
        insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
        values (${tenant.id}, ${edition}, 'Backwards', '2026-06-01 12:00Z', '2026-06-01 12:00Z')
      `,
    ).rejects.toThrow(/program_items_ends_after_start/)
  })

  it.each(itemAccountTables)('refuses a row of %s on an item of another tenant', async (table) => {
    const [a, b] = await Promise.all([createTenant(), createTenant()])
    const foreignItem = await createProgramItem(b.id, await createEdition(b.id))

    await expect(addToItem(table, a.id, foreignItem, a.headId)).rejects.toThrow(
      new RegExp(`${table}_program_item_fk`),
    )
  })

  // The answer must not tell whether the account already has a row on the other tenant's item.
  it.each(itemAccountTables)(
    'refuses a row of %s on a foreign item alike when the account has one there',
    async (table) => {
      const [a, b] = await Promise.all([createTenant(), createTenant()])
      const foreignItem = await createProgramItem(b.id, await createEdition(b.id))
      await addToItem(table, b.id, foreignItem, a.headId)

      await expect(addToItem(table, a.id, foreignItem, a.headId)).rejects.toThrow(
        new RegExp(`${table}_program_item_fk`),
      )
    },
  )

  it.each(itemAccountTables)('refuses a second row of %s for one account', async (table) => {
    const tenant = await createTenant()
    const item = await createProgramItem(tenant.id, await createEdition(tenant.id))
    await addToItem(table, tenant.id, item, tenant.headId)

    await expect(addToItem(table, tenant.id, item, tenant.headId)).rejects.toThrow(
      new RegExp(`${table}_tenant_item_account_unique`),
    )
  })

  it.each(itemAccountTables)('takes the rows of %s along with the edition', async (table) => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)
    const item = await createProgramItem(tenant.id, edition)
    await addToItem(table, tenant.id, item, tenant.headId)

    await migrator`delete from editions where id = ${edition}`

    expect(await countOn('program_items', 'edition_id', edition)).toBe(0)
    expect(await countOn(table, 'program_item_id', item)).toBe(0)
  })

  it.each(itemAccountTables)('takes the rows of %s along with the account', async (table) => {
    const tenant = await createTenant()
    const item = await createProgramItem(tenant.id, await createEdition(tenant.id))
    const account = await createUser()
    await addToItem(table, tenant.id, item, account.id)

    await authAdmin`delete from auth.users where id = ${account.id}`

    expect(await countOn(table, 'account_id', account.id)).toBe(0)
    expect(await countOn('program_items', 'id', item)).toBe(1)
  })

  it.each([
    ['program_items', 'title'],
    ['program_item_speakers', 'account_id'],
    ['program_item_likes', 'account_id'],
  ])('moves updated_at on every update of %s', async (table, column) => {
    const tenant = await createTenant()
    const item = await createProgramItem(tenant.id, await createEdition(tenant.id))
    await addToItem('program_item_speakers', tenant.id, item, tenant.headId)
    await addToItem('program_item_likes', tenant.id, item, tenant.headId)

    const [row] = await migrator.unsafe<{ moved: boolean }[]>(
      `update ${table} set ${column} = ${column} where tenant_id = '${tenant.id}'
       returning updated_at > created_at as moved`,
    )
    expect(row!.moved).toBe(true)
  })
})
