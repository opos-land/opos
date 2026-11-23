import { describe, expect, it } from 'vitest'
import { globalReads } from '../src/verify'
import { createEdition, createTenant, global, inTenant, migrator } from './db'

// What buyer self-service adds to the tables of the shop (docs/specs/0009-buyer-self-service.md):
// an order started with "Buy more" names the order it extends, an edition tells where and when
// merchandise is handed over, and an order link is found across tenants by the hash of its token.

interface Place {
  tenant: string
  edition: string
}

async function place(): Promise<Place> {
  const tenant = await createTenant()
  return { tenant: tenant.id, edition: await createEdition(tenant.id) }
}

const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id

let made = 0
const next = () => `${(made += 1)}`.padStart(6, '0')

const order = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    number: `X${next()}222`.replace(/[01]/g, '2'),
    status: 'paid',
    email: 'buyer@example.test',
    holder_name: 'Ada',
    total_minor: 0,
    holds: true,
    result_token_hash: `${next()}${Math.random()}`.padStart(64, 'b'),
    ...values,
  }
  return one(migrator`insert into orders ${migrator(row)} returning id`)
}

describe('an order started with "Buy more"', () => {
  it('names the order of its own tenant and edition it extends', async () => {
    const at = await place()
    const first = await order(at)

    const more = await order(at, { extends_order_id: first })

    const [row] = await migrator`select extends_order_id from orders where id = ${more}`
    expect(row!.extends_order_id).toBe(first)
  })

  it('never extends an order of another edition or of another tenant', async () => {
    const at = await place()
    const sibling = { tenant: at.tenant, edition: await createEdition(at.tenant) }
    const stranger = await place()

    for (const other of [sibling, stranger]) {
      const theirs = await order(other)
      await expect(order(at, { extends_order_id: theirs })).rejects.toThrow(/orders_extends_fk/)
    }
  })

  it('never extends itself', async () => {
    const at = await place()
    const first = await order(at)

    await expect(
      migrator`update orders set extends_order_id = id where id = ${first}`,
    ).rejects.toThrow(/orders_extends_another/)
  })

  it('is placed by the application role with the order it extends, which it never changes', async () => {
    const at = await place()
    const first = await order(at)
    const row = {
      tenant_id: at.tenant,
      edition_id: at.edition,
      number: `Y${next()}222`.replace(/[01]/g, '2'),
      status: 'awaiting-payment',
      email: 'buyer@example.test',
      holder_name: 'Ada',
      total_minor: 1500,
      holds: true,
      hold_ends_at: '2099-01-01T00:00:00Z',
      result_token_hash: next().padStart(64, 'c'),
      extends_order_id: first,
    }

    const [more] = await inTenant(
      at.tenant,
      (sql) => sql<{ id: string }[]>`insert into orders ${sql(row)} returning id`,
    )

    await expect(
      inTenant(
        at.tenant,
        (sql) => sql`update orders set extends_order_id = null where id = ${more!.id}`,
      ),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('the pick-up information of an edition', () => {
  const shop = (at: Place) =>
    migrator`insert into edition_shops (tenant_id, edition_id) values (${at.tenant}, ${at.edition})`

  it('is set by the application role, up to 1000 characters', async () => {
    const at = await place()
    await shop(at)
    const set = (text: string) =>
      inTenant(
        at.tenant,
        (sql) =>
          sql`update edition_shops set pickup_information = ${text} where edition_id = ${at.edition}`,
      )

    await set('At the merchandise desk in hall A, Friday to Sunday from 10 to 18.')
    await expect(set('a'.repeat(1001))).rejects.toThrow(/edition_shops_pickup_information/)

    const [row] = await migrator`
      select pickup_information from edition_shops where edition_id = ${at.edition}
    `
    expect(row!.pickup_information).toMatch(/^At the merchandise desk/)
  })
})

describe('an order link across tenants', () => {
  it('is found by the hash of its token, which answers its tenant alone', async () => {
    const at = await place()
    const id = await order(at)
    const hash = next().padStart(64, 'd')
    await migrator`
      insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at)
      values (${at.tenant}, ${at.edition}, ${id}, ${hash}, '2099-01-01')
    `

    const found = await global`select tenant_id from order_links where token_hash = ${hash}`

    expect(found).toEqual([{ tenant_id: at.tenant }])
  })

  it('lets opos_app_global read nothing else of a link, and write nothing', async () => {
    const columns = await migrator<{ column: string }[]>`
      select a.attname as column from pg_attribute a
      where a.attrelid = 'public.order_links'::regclass and a.attnum > 0 and not a.attisdropped
    `
    const reads = globalReads
      .filter((read) => read.startsWith('order_links.'))
      .map((read) => read.split('.')[1])
    expect(reads.sort()).toEqual(['tenant_id', 'token_hash'])
    for (const { column } of columns) {
      const read = global.unsafe(`select ${column} from order_links limit 1`)
      if (reads.includes(column)) await read
      else await expect(read, column).rejects.toThrow(/permission denied/)
    }
    for (const statement of [
      'delete from order_links where false',
      'update order_links set ended_at = now() where false',
    ]) {
      await expect(global.unsafe(statement), statement).rejects.toThrow(/permission denied/)
    }
  })
})
