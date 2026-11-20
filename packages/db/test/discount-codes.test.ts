import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, freshApp, inTenant, migrator } from './db'

// The discount codes of an edition (docs/specs/0008-discount-codes.md): a code with a value, what
// it applies to, a usage limit and a validity window. An order names the code it used, which is
// then never deleted; a use counts while its order holds.

interface Place {
  tenant: string
  edition: string
}

async function place(): Promise<Place> {
  const tenant = await createTenant()
  return { tenant: tenant.id, edition: await createEdition(tenant.id) }
}

const sibling = async (at: Place): Promise<Place> => ({
  tenant: at.tenant,
  edition: await createEdition(at.tenant),
})

const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id

let made = 0
const next = () => `${(made += 1)}`.padStart(6, '0')

const code = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    code: `code-${next()}`,
    kind: 'percent',
    percent: 10,
    valid_from: '2020-01-01T00:00:00Z',
    valid_until: '2099-01-01T00:00:00Z',
    ...values,
  }
  return one(migrator`insert into discount_codes ${migrator(row)} returning id`)
}

const ticketType = (at: Place) =>
  one(migrator`
    insert into ticket_types (tenant_id, edition_id, name, sale_starts_at, sale_ends_at,
      allows_child, allows_teen, allows_adult, position)
    values (${at.tenant}, ${at.edition}, ${`Type ${next()}`}, '2020-01-01', '2099-01-01', true, true,
      true, (select coalesce(max(position), 0) + 1 from ticket_types where edition_id = ${at.edition}))
    returning id
  `)

const addOn = (at: Place) =>
  one(migrator`
    insert into add_ons (tenant_id, edition_id, name, amount_minor, kind, position)
    values (${at.tenant}, ${at.edition}, 'Room', 0, 'unlimited',
      (select coalesce(max(position), 0) + 1 from add_ons where edition_id = ${at.edition}))
    returning id
  `)

const item = (at: Place) =>
  one(migrator`
    insert into merchandise_items (tenant_id, edition_id, name, amount_minor, per_order_limit,
      position)
    values (${at.tenant}, ${at.edition}, 'Pin', 1500, 10,
      (select coalesce(max(position), 0) + 1 from merchandise_items where edition_id = ${at.edition}))
    returning id
  `)

const order = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    number: `Z${next()}222`.replace(/[01]/g, '2'),
    status: 'paid',
    email: 'buyer@example.test',
    holder_name: 'Ada',
    total_minor: 0,
    holds: true,
    result_token_hash: next().padStart(64, 'a'),
    ...values,
  }
  return one(migrator`insert into orders ${migrator(row)} returning id`)
}

describe('discount_codes', () => {
  it('is a code of an edition of its own tenant, unique in it and kept in lower case', async () => {
    const [a, b] = await Promise.all([place(), place()])
    await code(a, { code: 'guest-2026' })

    await expect(code(a, { code: 'guest-2026' })).rejects.toThrow(
      /discount_codes_edition_code_unique/,
    )
    await code(await sibling(a), { code: 'guest-2026' })
    await code(b, { code: 'guest-2026' })
    await expect(code(a, { edition_id: b.edition })).rejects.toThrow(/discount_codes_edition_fk/)
    for (const text of ['GUEST', 'abc', 'with space', 'a'.repeat(41), 'żółw-2026']) {
      await expect(code(a, { code: text }), text).rejects.toThrow(/discount_codes_code/)
    }
  })

  it('takes a percent of 1 to 100 or an amount above zero, never both', async () => {
    const at = await place()

    await code(at, { kind: 'percent', percent: 100 })
    await code(at, { kind: 'amount', percent: null, amount_minor: 2000 })
    for (const values of [
      { kind: 'percent', percent: 0 },
      { kind: 'percent', percent: 101 },
      { kind: 'percent', percent: 10, amount_minor: 500 },
      { kind: 'amount', percent: null, amount_minor: 0 },
      { kind: 'amount', percent: 10, amount_minor: 500 },
      { kind: 'amount', percent: null, amount_minor: null },
    ]) {
      await expect(code(at, values), JSON.stringify(values)).rejects.toThrow(/discount_codes_value/)
    }
  })

  it('has a window that ends after it starts, and a limit of at least one use or none', async () => {
    const at = await place()

    await code(at, { usage_limit: 1 })
    await code(at, { usage_limit: null })
    await expect(code(at, { usage_limit: 0 })).rejects.toThrow(/discount_codes_usage_limit/)
    await expect(
      code(at, { valid_from: '2026-06-01T00:00:00Z', valid_until: '2026-06-01T00:00:00Z' }),
    ).rejects.toThrow(/discount_codes_window/)
  })

  it('applies to ticket types, add-ons and merchandise items of its own edition alone', async () => {
    const at = await place()
    const other = await sibling(at)
    const mine = await code(at)
    const of = { tenant_id: at.tenant, edition_id: at.edition, discount_code_id: mine }

    await migrator`insert into discount_code_ticket_types ${migrator({ ...of, ticket_type_id: await ticketType(at) })}`
    await migrator`insert into discount_code_add_ons ${migrator({ ...of, add_on_id: await addOn(at) })}`
    await migrator`insert into discount_code_merchandise_items ${migrator({ ...of, merchandise_item_id: await item(at) })}`
    await expect(
      migrator`insert into discount_code_ticket_types ${migrator({ ...of, ticket_type_id: await ticketType(other) })}`,
    ).rejects.toThrow(/discount_code_ticket_types_ticket_type_fk/)
    await expect(
      migrator`insert into discount_code_add_ons ${migrator({ ...of, add_on_id: await addOn(other) })}`,
    ).rejects.toThrow(/discount_code_add_ons_add_on_fk/)
    await expect(
      migrator`insert into discount_code_merchandise_items ${migrator({ ...of, merchandise_item_id: await item(other) })}`,
    ).rejects.toThrow(/discount_code_merchandise_items_item_fk/)
    // What a code applies to goes with the code.
    await migrator`delete from discount_codes where id = ${mine}`
    expect(
      await migrator`select 1 from discount_code_ticket_types where discount_code_id = ${mine}`,
    ).toEqual([])
  })
})

describe('an order with a discount code', () => {
  it('names a code of its own edition, which is never deleted from under it', async () => {
    const at = await place()
    const other = await sibling(at)
    const [mine, foreign] = [await code(at), await code(other)]

    await order(at, { discount_code_id: mine })
    await expect(order(at, { discount_code_id: foreign })).rejects.toThrow(
      /orders_discount_code_fk/,
    )
    await expect(migrator`delete from discount_codes where id = ${mine}`).rejects.toThrow(
      /orders_discount_code_fk/,
    )
  })

  it('carries what the code took off as one line below zero, and no other line is', async () => {
    const at = await place()
    const mine = await order(at, { discount_code_id: await code(at) })
    const line = (values: Record<string, unknown>) => migrator`
      insert into order_lines ${migrator({
        tenant_id: at.tenant,
        edition_id: at.edition,
        order_id: mine,
        quantity: 1,
        ...values,
      })}
    `

    await line({ kind: 'discount', unit_amount_minor: -1000, amount_minor: -1000 })
    await expect(
      line({ kind: 'discount', unit_amount_minor: -500, amount_minor: -500 }),
    ).rejects.toThrow(/order_lines_one_discount/)
    await expect(
      line({ kind: 'add_on', add_on_id: await addOn(at), unit_amount_minor: -1, amount_minor: -1 }),
    ).rejects.toThrow(/order_lines_amount/)
    const second = await order(at)
    await expect(
      migrator`
        insert into order_lines (tenant_id, edition_id, order_id, kind, quantity,
          unit_amount_minor, amount_minor)
        values (${at.tenant}, ${at.edition}, ${second}, 'discount', 1, 100, 100)
      `,
    ).rejects.toThrow(/order_lines_amount/)
  })

  // docs/ARCHITECTURE.md, invariant 9: a use counts against the limit under the lock of the
  // code's row, so two orders placed at the same moment take a last use once.
  it('lets one of two orders placed at the same moment take a code’s last use', async () => {
    const at = await place()
    const last = await code(at, { usage_limit: 1 })
    const take = (sql: ReturnType<typeof freshApp>, wait: Promise<unknown>) =>
      sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${at.tenant}, true)`
        await tx`select id from discount_codes where id = ${last} for update`
        const [held] = await tx<{ uses: number }[]>`
          select count(*)::int as uses from orders where discount_code_id = ${last} and holds
        `
        if (held!.uses >= 1) return false
        await wait
        await tx`
          insert into orders (tenant_id, edition_id, number, status, email, holder_name,
            total_minor, holds, hold_ends_at, result_token_hash, discount_code_id)
          values (${at.tenant}, ${at.edition}, ${`Y${next()}222`.replace(/[01]/g, '2')},
            'awaiting-payment', 'buyer@example.test', 'Ada', 0, true, now() + interval '30 minutes',
            ${next().padStart(64, 'b')}, ${last})
        `
        return true
      })
    const [first, second] = [freshApp(), freshApp()]
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))

    const a = take(first, held)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const b = take(second, Promise.resolve())
    await new Promise((resolve) => setTimeout(resolve, 200))
    release()

    expect([await a, await b]).toEqual([true, false])
    await Promise.all([first.end(), second.end()])
  })
})

describe('what the application role changes of a discount code', () => {
  it('sets a code, changes its terms, ends it and deletes one no order used', async () => {
    const at = await place()
    const [mine, unused] = [await code(at), await code(at)]
    const type = await ticketType(at)

    await inTenant(at.tenant, async (sql) => {
      await sql`
        insert into discount_codes (tenant_id, edition_id, code, kind, amount_minor, valid_from,
          valid_until)
        values (${at.tenant}, ${at.edition}, 'set-by-the-api', 'amount', 500, now(),
          now() + interval '1 day')
      `
      await sql`update discount_codes set code = 'renamed', usage_limit = 5, ended_at = now() where id = ${mine}`
      await sql`
        insert into discount_code_ticket_types (tenant_id, edition_id, discount_code_id, ticket_type_id)
        values (${at.tenant}, ${at.edition}, ${mine}, ${type})
      `
      await sql`delete from discount_code_ticket_types where discount_code_id = ${mine}`
      await sql`delete from discount_codes where id = ${unused}`
    })
    for (const statement of [
      `update discount_codes set edition_id = '${at.edition}'`,
      `update discount_codes set tenant_id = '${at.tenant}'`,
      `update orders set discount_code_id = null`,
      `update discount_code_ticket_types set ticket_type_id = '${type}'`,
    ]) {
      await expect(
        inTenant(at.tenant, (sql) => sql.unsafe(statement)),
        statement,
      ).rejects.toThrow(/permission denied/)
    }
  })

  it('reads the codes of its own tenant alone', async () => {
    const [a, b] = await Promise.all([place(), place()])
    await code(a)
    await code(b)

    expect(await inTenant(a.tenant, (sql) => sql`select tenant_id from discount_codes`)).toEqual([
      { tenant_id: a.tenant },
    ])
  })
})
