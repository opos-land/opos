import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { migrationUrl } from '../src/migration-url'
import { createEdition, createTenant, createUser, migrator, superuser, unique } from './db'

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
        const [waiting] = await superuser<{ count: number }[]>`
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

  it('refuses a slug outside the allowed format', async () => {
    await expect(
      migrator`insert into tenants (slug, name) values (${`Bad_${randomUUID().slice(0, 4)}`}, 'Bad')`,
    ).rejects.toThrow(/tenants_slug_format/)
  })
})
