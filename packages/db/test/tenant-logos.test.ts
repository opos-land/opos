import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, inTenant, migrator } from './db'

// A convention's logo (docs/specs/0014-edition-list-and-edition-page.md): a row of tenant_logos
// pointing at the convention's own file, at most one a tenant.

const SHA = 'b'.repeat(64)

const file = async (tenantId: string, editionId: string | null = null) => {
  const [row] = await migrator<{ id: string }[]>`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name, width, height)
    values (${tenantId}, ${editionId}, 'convention-logo', 'image/png', 10, ${SHA}, 'logo.png', 4, 3)
    returning id
  `
  return row!.id
}

const logo = (tenantId: string, fileId: string) =>
  migrator`insert into tenant_logos (tenant_id, file_id) values (${tenantId}, ${fileId})`

const logosOf = (tenantId: string) =>
  migrator`select file_id from tenant_logos where tenant_id = ${tenantId}`

describe('tenant_logos', () => {
  it('refuses a file of another tenant', async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()])
    const foreign = await file(b.id)

    await expect(logo(a.id, foreign)).rejects.toThrow(/tenant_logos_file_fk/)
  })

  it('refuses a second logo of one tenant', async () => {
    const tenant = await createTenant()
    await logo(tenant.id, await file(tenant.id))

    await expect(logo(tenant.id, await file(tenant.id))).rejects.toThrow(/tenant_logos_pkey/)
  })

  it('goes with its file', async () => {
    const tenant = await createTenant()
    const fileId = await file(tenant.id)
    await logo(tenant.id, fileId)

    await inTenant(tenant.id, (sql) => sql`delete from uploaded_files where id = ${fileId}`)

    expect(await logosOf(tenant.id)).toHaveLength(0)
  })

  it('goes with its tenant', async () => {
    const tenant = await createTenant()
    await logo(tenant.id, await file(tenant.id))

    await migrator`delete from tenants where id = ${tenant.id}`

    expect(await logosOf(tenant.id)).toHaveLength(0)
  })
})

describe('the venue of an edition', () => {
  it('is empty until it is set', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)

    const [row] = await migrator<
      { name: string | null; address: string | null; city: string | null }[]
    >`
      select venue_name as name, venue_address as address, venue_city as city
      from editions where id = ${edition}
    `

    expect(row).toEqual({ name: null, address: null, city: null })
  })

  it.each(['venue_name', 'venue_address', 'venue_city'])('refuses an empty %s', async (column) => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)

    await expect(
      migrator.unsafe(`update editions set ${column} = '  ' where id = '${edition}'`),
    ).rejects.toThrow(/editions_venue_/)
  })
})
