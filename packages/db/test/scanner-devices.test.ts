import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, freshApp, global, inTenant, migrator } from './db'

// The scanners of an edition (docs/specs/0007-scanner.md): a device with no account, enabled by
// an org, paired once with a code and known from then on by the hash of its token. A hand-out is
// written on the order's line, with the scanner that marked it.

interface Place {
  tenant: string
  edition: string
}

async function place(): Promise<Place> {
  const tenant = await createTenant()
  return { tenant: tenant.id, edition: await createEdition(tenant.id) }
}

const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id

/** The membership of the tenant's head: the org who enables the scanners of a test. */
const membership = async (at: Place) =>
  one(migrator`select id from tenant_memberships where tenant_id = ${at.tenant} limit 1`)

let hashes = 0
const hash = () => `${(hashes += 1)}`.padStart(64, '0')

const device = async (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    name: `Gate ${hash().slice(-6)}`,
    enabled_by_membership_id: await membership(at),
    pairing_code_hash: hash(),
    pairing_expires_at: '2099-01-01T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    ...values,
  }
  return one(migrator`insert into scanner_devices ${migrator(row)} returning id`)
}

/** A paid order with one line of an add-on: something to hand out. */
async function line(at: Place) {
  const order = await one(migrator`
    insert into orders (tenant_id, edition_id, number, status, email, holder_name, total_minor,
      holds, result_token_hash)
    values (${at.tenant}, ${at.edition}, ${`Z${hash().slice(-9).replace(/[01]/g, '2')}`}, 'paid',
      'buyer@example.test', 'Ada', 0, true, ${hash()})
    returning id
  `)
  const addOn = await one(migrator`
    insert into add_ons (tenant_id, edition_id, name, amount_minor, kind, position)
    values (${at.tenant}, ${at.edition}, 'Room', 0, 'unlimited',
      (select coalesce(max(position), 0) + 1 from add_ons where edition_id = ${at.edition}))
    returning id
  `)
  return one(migrator`
    insert into order_lines (tenant_id, edition_id, order_id, kind, add_on_id, quantity,
      unit_amount_minor, amount_minor)
    values (${at.tenant}, ${at.edition}, ${order}, 'add_on', ${addOn}, 1, 0, 0)
    returning id
  `)
}

describe('scanner_devices', () => {
  it('is a device of an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await device(a)
    await expect(device(a, { edition_id: b.edition })).rejects.toThrow(/scanner_devices_edition_fk/)
  })

  it('has a name of its own among the scanners of its edition that are not revoked', async () => {
    const at = await place()
    const other = { tenant: at.tenant, edition: await createEdition(at.tenant) }
    const gate = await device(at, { name: 'Main gate' })

    await expect(device(at, { name: 'Main gate' })).rejects.toThrow(/scanner_devices_name_unique/)
    await device(other, { name: 'Main gate' })
    // A revoked scanner gives its name back.
    await migrator`update scanner_devices set revoked_at = now() where id = ${gate}`
    await device(at, { name: 'Main gate' })
    for (const name of ['', '   ', 'n'.repeat(61)]) {
      await expect(device(at, { name })).rejects.toThrow(/scanner_devices_name/)
    }
  })

  it('is enabled by a membership of its own tenant, and outlives it with nobody behind it', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const org = await one(migrator`
      insert into tenant_memberships (account_id, tenant_id, role)
      select account_id, ${a.tenant}, 'org' from tenant_memberships where tenant_id = ${b.tenant}
      returning id
    `)
    const id = await device(a, { enabled_by_membership_id: org })

    await expect(device(a, { enabled_by_membership_id: await membership(b) })).rejects.toThrow(
      /scanner_devices_enabled_by_fk/,
    )
    // The org is removed: the scanner stays, for the hand-outs it marked, and opens nothing.
    await migrator`delete from tenant_memberships where id = ${org}`
    expect(
      await migrator`select tenant_id, enabled_by_membership_id from scanner_devices where id = ${id}`,
    ).toEqual([{ tenant_id: a.tenant, enabled_by_membership_id: null }])
  })

  it('is found by the hash of its pairing code and of its token, which no two scanners share', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const [code, token] = [hash(), hash()]
    await device(a, { pairing_code_hash: code, token_hash: token })

    await expect(device(b, { pairing_code_hash: code })).rejects.toThrow(
      /scanner_devices_pairing_code_hash_unique/,
    )
    await expect(device(b, { token_hash: token })).rejects.toThrow(
      /scanner_devices_token_hash_unique/,
    )
    // A scanner not yet paired has no token.
    await device(b)
    await device(b)
  })
})

describe('a hand-out', () => {
  it('names the scanner of its own edition that marked it, and has a time', async () => {
    const at = await place()
    const other = { tenant: at.tenant, edition: await createEdition(at.tenant) }
    const [mine, foreign, held] = [await device(at), await device(other), await line(at)]

    await migrator`update order_lines set handed_out_at = now(), handed_out_by = ${mine} where id = ${held}`
    await expect(
      migrator`update order_lines set handed_out_by = ${foreign} where id = ${held}`,
    ).rejects.toThrow(/order_lines_handed_out_by_fk/)
    await expect(
      migrator`update order_lines set handed_out_at = null where id = ${held}`,
    ).rejects.toThrow(/order_lines_handed_out_by/)
    // A mark made in the panel names no scanner.
    await migrator`update order_lines set handed_out_by = null where id = ${held}`
  })

  // docs/ARCHITECTURE.md, invariant 10: one conditional update, never a read followed by a write.
  it('is marked once by two scanners at the same moment', async () => {
    const at = await place()
    const [first, second, held] = [await device(at), await device(at), await line(at)]
    const mark = (sql: ReturnType<typeof freshApp>, by: string, wait: Promise<unknown>) =>
      sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${at.tenant}, true)`
        const marked = await tx`
          update order_lines set handed_out_at = now(), handed_out_by = ${by}
          where id = ${held} and handed_out_at is null
          returning id
        `
        await wait
        return marked.length
      })
    const [one, two] = [freshApp(), freshApp()]
    let release: () => void = () => undefined
    const held1 = new Promise<void>((resolve) => (release = resolve))

    const a = mark(one, first, held1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const b = mark(two, second, Promise.resolve())
    await new Promise((resolve) => setTimeout(resolve, 200))
    release()

    expect([await a, await b]).toEqual([1, 0])
    expect(await migrator`select handed_out_by from order_lines where id = ${held}`).toEqual([
      { handed_out_by: first },
    ])
    await Promise.all([one.end(), two.end()])
  })
})

describe('what the application role changes of a scanner', () => {
  it('pairs it, records its use and revokes it, and changes nothing else of it', async () => {
    const at = await place()
    const id = await device(at)

    await inTenant(at.tenant, async (sql) => {
      await sql`update scanner_devices set paired_at = now(), token_hash = ${hash()} where id = ${id}`
      await sql`update scanner_devices set last_used_at = now() where id = ${id}`
      await sql`update scanner_devices set revoked_at = now() where id = ${id}`
    })
    for (const statement of [
      `update scanner_devices set name = 'Other'`,
      `update scanner_devices set edition_id = '${at.edition}'`,
      `update scanner_devices set enabled_by_membership_id = null`,
      `update scanner_devices set expires_at = now() + interval '10 years'`,
      `update scanner_devices set pairing_code_hash = '${hash()}'`,
      `update scanner_devices set pairing_expires_at = now() + interval '10 years'`,
      `delete from scanner_devices`,
    ]) {
      await expect(inTenant(at.tenant, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('reads a scanner of its own tenant alone', async () => {
    const [a, b] = await Promise.all([place(), place()])
    await device(a)
    const foreign = await device(b)

    const seen = await inTenant(a.tenant, (sql) => sql`select tenant_id from scanner_devices`)
    expect(seen).toEqual([{ tenant_id: a.tenant }])
    await expect(
      inTenant(
        a.tenant,
        (sql) =>
          sql`update scanner_devices set revoked_at = now() where id = ${foreign} returning id`,
      ),
    ).resolves.toEqual([])
  })
})

// A pairing code and a device's token are each looked up across tenants by their hash; the
// lookup answers the identifiers that open the tenant's context, and nothing of the device.
describe('the lookup of a scanner across tenants', () => {
  it('finds the tenant of a scanner by a hash, and reads nothing else of it', async () => {
    const at = await place()
    const [code, token] = [hash(), hash()]
    const id = await device(at, { pairing_code_hash: code, token_hash: token })

    expect(
      await global`select id, tenant_id from scanner_devices where token_hash = ${token}`,
    ).toEqual([{ id, tenant_id: at.tenant }])
    expect(
      await global`select id, tenant_id from scanner_devices where pairing_code_hash = ${code}`,
    ).toEqual([{ id, tenant_id: at.tenant }])
    for (const column of ['name', 'edition_id', 'enabled_by_membership_id', 'expires_at']) {
      await expect(global.unsafe(`select ${column} from scanner_devices limit 1`)).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
