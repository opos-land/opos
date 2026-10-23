import { describe, expect, it } from 'vitest'
import { app, createEdition, createTenant, inTenant, superuser } from './db'

describe('tenant isolation', () => {
  it('rejects a query without a tenant context', async () => {
    await expect(app`select id from editions`).rejects.toThrow(
      /app\.tenant_id|invalid input syntax for type uuid/,
    )
  })

  it('returns only the rows of the tenant in context', async () => {
    const a = await createTenant()
    const b = await createTenant()
    await createEdition(a.id)
    await createEdition(b.id)

    const rows = await inTenant(b.id, async (sql) => ({
      tenants: await sql<{ id: string }[]>`select id from tenants`,
      editions: await sql<{ tenant_id: string }[]>`select tenant_id from editions`,
      memberships: await sql<{ tenant_id: string }[]>`select tenant_id from tenant_memberships`,
    }))

    expect(rows.tenants.map((r) => r.id)).toEqual([b.id])
    expect(rows.editions.every((r) => r.tenant_id === b.id)).toBe(true)
    expect(rows.memberships.every((r) => r.tenant_id === b.id)).toBe(true)
  })

  it('rejects an insert with another tenant id', async () => {
    const a = await createTenant()
    const b = await createTenant()

    await expect(
      inTenant(
        b.id,
        (sql) => sql`
        insert into editions (tenant_id, slug, name, starts_at, ends_at)
        values (${a.id}, 'foreign', 'Foreign', '2026-06-01', '2026-06-03')
      `,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it.each(['anon', 'authenticated'])('gives %s no access to public tables', async (role) => {
    for (const table of [
      'accounts',
      'tenants',
      'tenant_memberships',
      'editions',
      'edition_memberships',
    ]) {
      await expect(
        superuser.begin(async (sql) => {
          await sql.unsafe(`set local role ${role}`)
          await sql.unsafe(`select 1 from public.${table} limit 1`)
        }),
      ).rejects.toThrow(/permission denied/)
    }
  })
})
