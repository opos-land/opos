import { describe, expect, it } from 'vitest'
import { globalReads } from '../src/verify'
import {
  app,
  authAdmin,
  createEdition,
  createTenant,
  createUser,
  global,
  inTenant,
  migrator,
} from './db'

// The rows of file storage (docs/specs/0012-file-storage.md): a convention's or an edition's file
// in uploaded_files, a tenant table; an account's in account_files, a global table.

const SHA = 'a'.repeat(64)

const uploaded = (tenantId: string, editionId: string | null = null, values = '') =>
  migrator.unsafe<{ id: string }[]>(`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name${values ? ', width, height' : ''})
    values ('${tenantId}', ${editionId ? `'${editionId}'` : 'null'}, 'test', 'application/pdf', 10, '${SHA}', 'terms.pdf'${values})
    returning id
  `)

const accountFile = (accountId: string) =>
  migrator<{ id: string }[]>`
    insert into account_files (account_id, kind, content_type, size, sha256, name, width, height)
    values (${accountId}, 'test', 'image/png', 10, ${SHA}, 'me.png', 4, 3)
    returning id
  `

describe('uploaded_files', () => {
  it('refuses an edition of another tenant', async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()])
    const foreign = await createEdition(b.id)

    await expect(uploaded(a.id, foreign)).rejects.toThrow(/uploaded_files_edition_fk/)
  })

  it('goes with its edition and with its tenant', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)
    const [ofEdition] = await uploaded(tenant.id, edition)
    const [ofConvention] = await uploaded(tenant.id)

    await inTenant(tenant.id, (sql) => sql`delete from editions where id = ${edition}`)
    expect(await migrator`select id from uploaded_files where id = ${ofEdition!.id}`).toHaveLength(
      0,
    )
    expect(
      await migrator`select id from uploaded_files where id = ${ofConvention!.id}`,
    ).toHaveLength(1)

    await migrator`delete from tenants where id = ${tenant.id}`
    expect(
      await migrator`select id from uploaded_files where id = ${ofConvention!.id}`,
    ).toHaveLength(0)
  })

  it.each([
    ['a type the storage does not keep', `content_type = 'text/html'`],
    ['an empty file', 'size = 0'],
    ['a file over 15 MB', `size = ${15 * 1024 * 1024 + 1}`],
    ['a checksum that is not hex SHA-256', `sha256 = 'abc'`],
    ['an empty name', `name = ''`],
    ['a name over 255 characters', `name = repeat('n', 256)`],
    ['a width without a height', 'width = 4'],
    ['a dimension that is not positive', 'width = 0, height = 0'],
  ])('refuses %s', async (_, change) => {
    const tenant = await createTenant()
    const [file] = await uploaded(tenant.id)

    await expect(
      migrator.unsafe(`update uploaded_files set ${change} where id = '${file!.id}'`),
    ).rejects.toThrow(/uploaded_files_/)
  })

  it('takes an image with its width and height', async () => {
    const tenant = await createTenant()
    await uploaded(tenant.id, null, ', 640, 480')
  })

  it('lets opos_app insert, read and delete a file of its tenant, and change none', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)

    await inTenant(tenant.id, async (sql) => {
      const [file] = await sql<{ id: string }[]>`
        insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
        values (${tenant.id}, ${edition}, 'test', 'image/webp', 5, ${SHA}, 'x.webp')
        returning id
      `
      expect(await sql`select id from uploaded_files where id = ${file!.id}`).toHaveLength(1)
      await sql`delete from uploaded_files where id = ${file!.id}`
    })
    for (const column of ['name', 'size', 'kind', 'tenant_id', 'edition_id', 'sha256']) {
      await expect(
        inTenant(tenant.id, (sql) =>
          sql.unsafe(`update uploaded_files set ${column} = ${column} where false`),
        ),
        column,
      ).rejects.toThrow(/permission denied/)
    }
  })
})

describe('account_files', () => {
  it('goes with its account', async () => {
    const user = await createUser()
    const [file] = await accountFile(user.id)

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await migrator`select 1 from account_files where id = ${file!.id}`).toHaveLength(0)
  })

  it.each([
    ['a type the storage does not keep', `content_type = 'image/svg+xml'`],
    ['a file over 15 MB', `size = ${15 * 1024 * 1024 + 1}`],
    ['a checksum that is not hex SHA-256', `sha256 = upper(sha256)`],
    ['a height without a width', 'width = null'],
  ])('refuses %s', async (_, change) => {
    const user = await createUser()
    const [file] = await accountFile(user.id)

    await expect(
      migrator.unsafe(`update account_files set ${change} where id = '${file!.id}'`),
    ).rejects.toThrow(/account_files_/)
  })

  it('lets opos_app select, insert and delete, and update nothing', async () => {
    const user = await createUser()

    const [file] = await app<{ id: string }[]>`
      insert into account_files (account_id, kind, content_type, size, sha256, name)
      values (${user.id}, 'test', 'application/pdf', 3, ${SHA}, 'cv.pdf')
      returning id
    `
    expect(await app`select name from account_files where id = ${file!.id}`).toHaveLength(1)
    for (const column of ['name', 'account_id', 'size', 'kind']) {
      await expect(
        app.unsafe(`update account_files set ${column} = ${column} where false`),
        column,
      ).rejects.toThrow(/permission denied/)
    }
    await app`delete from account_files where id = ${file!.id}`
    expect(await app`select 1 from account_files where id = ${file!.id}`).toHaveLength(0)
  })

  it('lets opos_app_global read only what the sweep needs, and write nothing', async () => {
    const columns = await migrator<{ column: string }[]>`
      select a.attname as column from pg_attribute a
      where a.attrelid = 'public.account_files'::regclass and a.attnum > 0 and not a.attisdropped
    `
    const reads = globalReads
      .filter((read) => read.startsWith('account_files.'))
      .map((read) => read.split('.')[1])
    expect(reads.length).toBeGreaterThan(0)
    for (const { column } of columns) {
      const read = global.unsafe(`select ${column} from account_files limit 1`)
      if (reads.includes(column)) await read
      else await expect(read, column).rejects.toThrow(/permission denied/)
    }
    for (const statement of [
      'insert into account_files default values',
      'delete from account_files where false',
      'update account_files set name = name where false',
    ]) {
      await expect(global.unsafe(statement), statement).rejects.toThrow(/permission denied/)
    }
  })

  it('is out of reach of the Supabase API roles', async () => {
    const [row] = await migrator<{ held: boolean }[]>`
      select bool_or(has_table_privilege(r.role, 'account_files', p.privilege)) as held
      from (values ('anon'), ('authenticated'), ('service_role')) r(role)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
    `
    expect(row!.held).toBe(false)
  })
})
