import { describe, expect, it } from 'vitest'
import { adminReads, adminUpdates, adminWrites } from '../src/verify'
import { admin, app, global, migrator } from './db'

// opos_admin bypasses RLS, so its privileges are its only limit. db:verify refuses what it holds
// beyond the three lists; this holds the lists and the grants of the migrations together from
// the other side, table by table: the role reaches what a list names and nothing else.

const tables = await migrator<{ name: string }[]>`
  select c.relname as name from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  order by 1
`

const columnsOf = async (table: string) =>
  (
    await migrator<{ column: string }[]>`
      select a.attname as column from pg_attribute a
      where a.attrelid = ${'public.' + table}::regclass and a.attnum > 0 and not a.attisdropped
    `
  ).map((row) => row.column)

describe('opos_admin', () => {
  it('lists only tables and columns that exist', async () => {
    const existing = new Set<string>()
    for (const { name } of tables) {
      existing.add(`${name} INSERT`).add(`${name} DELETE`)
      for (const column of await columnsOf(name)) existing.add(`${name}.${column}`)
    }
    for (const entry of [...adminReads, ...adminWrites, ...adminUpdates]) {
      expect(existing.has(entry), entry).toBe(true)
    }
  })

  // `default values`, `= null` and a `false` condition reach the privilege check before anything
  // else, so only a missing privilege can refuse them.
  it.each(tables.map((table) => table.name))(
    'reaches of %s what its lists name and nothing else',
    async (table) => {
      for (const column of await columnsOf(table)) {
        const read = admin.unsafe(`select ${column} from ${table} limit 1`)
        if (adminReads.includes(`${table}.${column}`)) await read
        else await expect(read, `select ${column}`).rejects.toThrow(/permission denied/)

        const update = admin.unsafe(`update ${table} set ${column} = null where false`)
        if (adminUpdates.includes(`${table}.${column}`)) await update
        else await expect(update, `update ${column}`).rejects.toThrow(/permission denied/)
      }
      const insert = admin.unsafe(`insert into ${table} default values`)
      if (adminWrites.includes(`${table} INSERT`)) {
        // The privilege holds, so a constraint refuses the empty row instead.
        await expect(insert, 'insert').rejects.not.toThrow(/permission denied/)
      } else await expect(insert, 'insert').rejects.toThrow(/permission denied/)

      const remove = admin.unsafe(`delete from ${table} where false`)
      if (adminWrites.includes(`${table} DELETE`)) await remove
      else await expect(remove, 'delete').rejects.toThrow(/permission denied/)

      await expect(admin.unsafe(`truncate ${table}`), 'truncate').rejects.toThrow(
        /permission denied/,
      )
    },
  )

  it('suspends and restores a tenant, which opos_app and opos_app_global cannot', async () => {
    for (const sql of [app, global]) {
      await expect(
        sql.unsafe(`update tenants set suspended_at = now() where false`),
      ).rejects.toThrow(/permission denied/)
    }
    await admin.unsafe(`update tenants set suspended_at = now() where false`)
  })

  it.each(['retired_tenant_slugs'])('shares %s with no runtime role', async (table) => {
    for (const sql of [app, global, admin]) {
      await expect(sql.unsafe(`select * from ${table} limit 1`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(sql.unsafe(`delete from ${table} where false`)).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
