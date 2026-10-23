import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, createUser, migrator } from './db'

describe('invariants', () => {
  it('allows one active edition per tenant', async () => {
    const tenant = await createTenant()
    await createEdition(tenant.id, { isActive: true })

    await expect(createEdition(tenant.id, { isActive: true })).rejects.toThrow(
      /editions_one_active_per_tenant/,
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
