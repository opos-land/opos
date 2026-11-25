import { describe, expect, it } from 'vitest'
import { globalReads } from '../src/verify'
import { createEdition, createTenant, createUser, global, inTenant, migrator } from './db'

// Orders and what they hold (docs/specs/0004-checkout-and-orders.md): an order with its lines,
// answers, consents, QR code, payment attempts, emails and links. Every row is its tenant's and
// its edition's, and points only at rows of the same two. An order is never deleted while its
// edition stands, and what it holds of the catalog stays as long as it does.

const HASH = 'a'.repeat(64)

interface Place {
  tenant: string
  edition: string
}

async function place(): Promise<Place> {
  const tenant = await createTenant()
  return { tenant: tenant.id, edition: await createEdition(tenant.id) }
}

/** Another edition of the same tenant: a row of it is as foreign as another tenant's. */
const sibling = async (at: Place): Promise<Place> => ({
  tenant: at.tenant,
  edition: await createEdition(at.tenant),
})

const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id

/** The characters of an order's number: none that is mistaken for another. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

let numbers = 0
/** A number of ten characters no other order of the run has. */
function number() {
  let left = (numbers += 1)
  let text = ''
  while (left > 0) {
    text = ALPHABET[left % ALPHABET.length]! + text
    left = Math.floor(left / ALPHABET.length)
  }
  return text.padStart(10, 'Z')
}

const order = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    number: number(),
    status: 'awaiting-payment',
    email: 'buyer@example.test',
    holder_name: 'Ada',
    age_band: 'adult',
    total_minor: 10000,
    holds: true,
    hold_ends_at: '2099-01-01T00:00:00Z',
    result_token_hash: HASH,
    ...values,
  }
  return one(migrator`insert into orders ${migrator(row)} returning id`)
}

const ticketType = (at: Place) =>
  one(migrator`
    insert into ticket_types (tenant_id, edition_id, name, sale_starts_at, sale_ends_at,
      allows_child, allows_teen, allows_adult, position)
    values (${at.tenant}, ${at.edition}, 'Standard', '2026-01-01', '2099-01-01', true, true, true, 1)
    returning id
  `)

const addOn = (at: Place) =>
  one(migrator`
    insert into add_ons (tenant_id, edition_id, name, amount_minor, kind, position)
    values (${at.tenant}, ${at.edition}, 'Room', 0, 'unlimited', 1)
    returning id
  `)

/** An item with its one variant; answers both. */
async function item(at: Place) {
  const id = await one(migrator`
    insert into merchandise_items (tenant_id, edition_id, name, amount_minor, per_order_limit,
      position)
    values (${at.tenant}, ${at.edition}, 'Pin', 1500, 10, 1)
    returning id
  `)
  const variant = await one(migrator`
    insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
    values (${at.tenant}, ${at.edition}, ${id}, 5)
    returning id
  `)
  return { id, variant }
}

const line = (at: Place, orderId: string, values: Record<string, unknown>) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    order_id: orderId,
    quantity: 1,
    unit_amount_minor: 10000,
    amount_minor: 10000,
    ...values,
  }
  return one(migrator`insert into order_lines ${migrator(row)} returning id`)
}

const ticketLine = (at: Place, orderId: string, ticketTypeId: string) =>
  line(at, orderId, { kind: 'ticket', ticket_type_id: ticketTypeId })

const attempt = (at: Place, orderId: string, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    order_id: orderId,
    provider: 'fake',
    status: 'started',
    amount_minor: 10000,
    ...values,
  }
  return one(migrator`insert into payment_attempts ${migrator(row)} returning id`)
}

describe('orders', () => {
  it('belongs to an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await expect(order({ tenant: a.tenant, edition: b.edition })).rejects.toThrow(
      /orders_edition_fk/,
    )
  })

  it('has a number of its own within its convention, which another convention may use too', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const taken = number()
    await order(a, { number: taken })

    await expect(order(await sibling(a), { number: taken })).rejects.toThrow(
      /orders_tenant_number_unique/,
    )
    await order(b, { number: taken })
  })

  // A checkout sent again finds the order it placed by the hash of its key: one order of an
  // edition carries it, and an order placed with no key carries none.
  it('carries the hash of its placement key alone in its edition, and none where it had no key', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const taken = 'd'.repeat(64)
    await order(a, { placement_key_hash: taken })

    await expect(order(a, { placement_key_hash: taken })).rejects.toThrow(
      /orders_placement_key_unique/,
    )
    await order(await sibling(a), { placement_key_hash: taken })
    await order(b, { placement_key_hash: taken })
    await order(a, { placement_key_hash: null })
    await order(a, { placement_key_hash: null })
  })

  it.each([
    ['a status OPOS does not know', { status: 'refunded' }, /order_status/],
    ['a number that is not ten characters', { number: 'SHORT' }, /orders_number/],
    ['a number with a character mistaken for another', { number: 'O000000001' }, /orders_number/],
    ['a total below zero', { total_minor: -1 }, /orders_total/],
    ['another currency', { currency: 'EUR' }, /orders_currency/],
    ['a holder over 200 characters', { holder_name: 'n'.repeat(201) }, /orders_holder_name/],
    ['an age band OPOS does not know', { age_band: 'senior' }, /age_band/],
    ['an email that is no address', { email: 'buyer' }, /orders_email/],
    ['an email not written in lower case', { email: 'Buyer@Example.test' }, /orders_email/],
  ])('refuses %s', async (_, values, constraint) => {
    await expect(order(await place(), values)).rejects.toThrow(constraint)
  })

  it('takes an order with no age band and one with no email', async () => {
    const at = await place()

    // A merch-only order has no ticket holder to place in a band; a manual one has no buyer's
    // address.
    await order(at, { age_band: null })
    await order(at, {
      email: null,
      status: 'paid-manual',
      manual_reason: 'desk',
      holds: true,
      hold_ends_at: null,
    })
  })

  it('keeps its edition: an edition that has an order is not deleted', async () => {
    const at = await place()
    await order(at)

    await expect(
      inTenant(at.tenant, (sql) => sql`delete from editions where id = ${at.edition}`),
    ).rejects.toThrow(/orders_edition_fk/)
    await expect(migrator`delete from tenants where id = ${at.tenant}`).rejects.toThrow(
      /orders_edition_fk/,
    )
  })
})

describe('order_lines', () => {
  it('sells a ticket type, an add-on or a variant of its own edition', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)
    const mine = await order(a)

    for (const foreign of [b, elsewhere]) {
      await expect(ticketLine(a, mine, await ticketType(foreign))).rejects.toThrow(
        /order_lines_ticket_type_fk/,
      )
      await expect(
        line(a, mine, { kind: 'add_on', add_on_id: await addOn(foreign) }),
      ).rejects.toThrow(/order_lines_add_on_fk/)
      const theirs = await item(foreign)
      await expect(
        line(a, mine, {
          kind: 'merchandise',
          merchandise_item_id: theirs.id,
          merchandise_variant_id: theirs.variant,
        }),
        // Both the item and its variant are foreign: whichever key is checked first refuses.
      ).rejects.toThrow(/order_lines_item_fk|order_lines_variant_fk/)
      await expect(ticketLine(a, await order(foreign), await ticketType(a))).rejects.toThrow(
        /order_lines_order_fk|order_lines_ticket_type_fk/,
      )
    }
  })

  it('names the variant of the item it names, and no other', async () => {
    const at = await place()
    const [pin, mug] = [await item(at), await item(at)]

    await expect(
      line(at, await order(at), {
        kind: 'merchandise',
        merchandise_item_id: pin.id,
        merchandise_variant_id: mug.variant,
      }),
    ).rejects.toThrow(/order_lines_variant_fk/)
  })

  it.each([
    ['a ticket line with no ticket type', { kind: 'ticket' }],
    ['an add-on line that names a ticket type', { kind: 'add_on', ticket: true }],
    ['a merchandise line with no variant', { kind: 'merchandise', item: true }],
    ['a ticket line that names a variant too', { kind: 'ticket', ticket: true, variant: true }],
  ])('refuses %s', async (_, shape) => {
    const at = await place()
    const pin = await item(at)
    const values = {
      kind: shape.kind,
      ...('ticket' in shape && { ticket_type_id: await ticketType(at) }),
      ...('item' in shape && { merchandise_item_id: pin.id }),
      ...('variant' in shape && {
        merchandise_item_id: pin.id,
        merchandise_variant_id: pin.variant,
      }),
    }

    await expect(line(at, await order(at), values)).rejects.toThrow(/order_lines_sells/)
  })

  it('holds at most one ticket an order, and any number of other lines', async () => {
    const at = await place()
    const [mine, standard, pin] = [await order(at), await ticketType(at), await item(at)]
    await ticketLine(at, mine, standard)

    await expect(ticketLine(at, mine, standard)).rejects.toThrow(/order_lines_one_ticket/)
    for (let n = 0; n < 2; n += 1) {
      await line(at, mine, {
        kind: 'merchandise',
        merchandise_item_id: pin.id,
        merchandise_variant_id: pin.variant,
      })
    }
    // Another order holds a ticket of its own.
    await ticketLine(at, await order(at), standard)
  })

  it('refuses a quantity below one, and a ticket in more than one', async () => {
    const at = await place()
    const [mine, standard] = [await order(at), await ticketType(at)]

    await expect(
      line(at, mine, { kind: 'ticket', ticket_type_id: standard, quantity: 0 }),
    ).rejects.toThrow(/order_lines_quantity/)
    await expect(
      line(at, mine, { kind: 'ticket', ticket_type_id: standard, quantity: 2 }),
    ).rejects.toThrow(/order_lines_quantity/)
  })

  it('keeps what it sells: a row of the catalog an order holds is not deleted', async () => {
    const at = await place()
    const [mine, standard, room, pin] = [
      await order(at),
      await ticketType(at),
      await addOn(at),
      await item(at),
    ]
    await ticketLine(at, mine, standard)
    await line(at, mine, { kind: 'add_on', add_on_id: room })
    await line(at, mine, {
      kind: 'merchandise',
      merchandise_item_id: pin.id,
      merchandise_variant_id: pin.variant,
    })

    for (const [table, id, key] of [
      ['ticket_types', standard, /order_lines_ticket_type_fk/],
      ['add_ons', room, /order_lines_add_on_fk/],
      ['merchandise_variants', pin.variant, /order_lines_variant_fk/],
      ['merchandise_items', pin.id, /order_lines_variant_fk|order_lines_item_fk/],
    ] as const) {
      await expect(
        inTenant(at.tenant, (sql) => sql.unsafe(`delete from ${table} where id = '${id}'`)),
      ).rejects.toThrow(key)
    }
  })
})

describe('what an order was told and accepted', () => {
  const customField = (at: Place) =>
    one(migrator`
      insert into edition_custom_fields (tenant_id, edition_id, label, is_required, position)
      values (${at.tenant}, ${at.edition}, 'City', true, 1)
      returning id
    `)
  const consent = (at: Place) =>
    one(migrator`
      insert into edition_consents (tenant_id, edition_id, text, is_required, position)
      values (${at.tenant}, ${at.edition}, 'I accept.', true, 1)
      returning id
    `)
  const answer = (at: Place, orderId: string, fieldId: string, text = 'Poznań') =>
    migrator`
      insert into order_custom_field_answers (tenant_id, edition_id, order_id, custom_field_id, answer)
      values (${at.tenant}, ${at.edition}, ${orderId}, ${fieldId}, ${text})
    `
  const accepted = (at: Place, orderId: string, consentId: string) =>
    migrator`
      insert into order_consents (tenant_id, edition_id, order_id, consent_id)
      values (${at.tenant}, ${at.edition}, ${orderId}, ${consentId})
    `

  it('answers a custom field of its own edition once, in up to 200 characters', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const [mine, city] = [await order(a), await customField(a)]
    await answer(a, mine, city)

    await expect(answer(a, mine, city)).rejects.toThrow(/order_custom_field_answers_pkey/)
    await expect(answer(a, await order(a), city, 'a'.repeat(201))).rejects.toThrow(
      /order_custom_field_answers_answer/,
    )
    for (const foreign of [b, await sibling(a)]) {
      await expect(answer(a, await order(a), await customField(foreign))).rejects.toThrow(
        /order_custom_field_answers_field_fk/,
      )
    }
  })

  it('accepts a consent of its own edition once', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const [mine, terms] = [await order(a), await consent(a)]
    await accepted(a, mine, terms)

    await expect(accepted(a, mine, terms)).rejects.toThrow(/order_consents_pkey/)
    for (const foreign of [b, await sibling(a)]) {
      await expect(accepted(a, await order(a), await consent(foreign))).rejects.toThrow(
        /order_consents_consent_fk/,
      )
    }
  })

  it('keeps the field it answered and the consent it accepted', async () => {
    const at = await place()
    const [mine, city, terms] = [await order(at), await customField(at), await consent(at)]
    await answer(at, mine, city)
    await accepted(at, mine, terms)

    await expect(
      inTenant(at.tenant, (sql) => sql`delete from edition_custom_fields where id = ${city}`),
    ).rejects.toThrow(/order_custom_field_answers_field_fk/)
    await expect(
      inTenant(at.tenant, (sql) => sql`delete from edition_consents where id = ${terms}`),
    ).rejects.toThrow(/order_consents_consent_fk/)
  })
})

describe('the account and the QR code of an order', () => {
  const attach = (at: Place, orderId: string, accountId: string) =>
    migrator`
      insert into order_accounts (tenant_id, edition_id, order_id, account_id)
      values (${at.tenant}, ${at.edition}, ${orderId}, ${accountId})
    `
  const qrCode = (at: Place, hash = HASH) =>
    one(migrator`
      insert into order_qr_codes (tenant_id, edition_id, code_hash, code)
      values (${at.tenant}, ${at.edition}, ${hash}, 'sealed')
      returning id
    `)
  const carry = (at: Place, orderId: string, codeId: string) =>
    migrator`
      insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
      values (${at.tenant}, ${at.edition}, ${orderId}, ${codeId})
    `

  it('is attached to one account, and outlives it', async () => {
    const at = await place()
    const [mine, buyer, other] = [await order(at), await createUser(), await createUser()]
    await attach(at, mine, buyer.id)

    await expect(attach(at, mine, other.id)).rejects.toThrow(/order_accounts_pkey/)

    await migrator`delete from auth.users where id = ${buyer.id}`
    expect(await migrator`select 1 from orders where id = ${mine}`).toHaveLength(1)
    expect(await migrator`select 1 from order_accounts where order_id = ${mine}`).toHaveLength(0)
  })

  it('carries one QR code, which several orders of an edition may share', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const [first, more, code] = [await order(a), await order(a), await qrCode(a, 'b'.repeat(64))]
    await carry(a, first, code)
    await carry(a, more, code)

    await expect(carry(a, first, await qrCode(a, 'c'.repeat(64)))).rejects.toThrow(
      /order_qr_code_orders_pkey/,
    )
    for (const foreign of [b, await sibling(a)]) {
      await expect(
        carry(a, await order(a), await qrCode(foreign, HASH.replace('a', String(numbers)))),
      ).rejects.toThrow(/order_qr_code_orders_code_fk/)
    }
  })

  it('finds a code by its hash, which no two codes share', async () => {
    const at = await place()
    const hash = 'd'.repeat(64)
    await qrCode(at, hash)

    await expect(qrCode(at, hash)).rejects.toThrow(/order_qr_codes_code_hash_unique/)
  })
})

describe('payment_attempts', () => {
  it('is an attempt of an order of its own edition', async () => {
    const [a, b] = await Promise.all([place(), place()])

    for (const foreign of [b, await sibling(a)]) {
      await expect(attempt(a, await order(foreign))).rejects.toThrow(/payment_attempts_order_fk/)
    }
  })

  it.each([
    ['a provider OPOS has no module of', { provider: 'cash' }, /payment_attempts_provider/],
    ['a status OPOS does not know', { status: 'pending' }, /payment_attempt_status/],
    ['an amount of nothing', { amount_minor: 0 }, /payment_attempts_amount/],
    ['money said to be somewhere unknown', { money_with: 'bank' }, /payment_money_with/],
    ['a reason no page of the shop words', { failure_reason: 'fraud' }, /payment_failure_reason/],
  ])('refuses %s', async (_, values, constraint) => {
    const at = await place()

    await expect(attempt(at, await order(at), values)).rejects.toThrow(constraint)
  })

  it('keeps what its provider said of it', async () => {
    const at = await place()
    const id = await attempt(at, await order(at), {
      status: 'failed',
      failure_reason: 'declined',
      failure_code: '100',
      failure_message: 'Declined by the bank',
      provider_reference: 'P24-1',
      information: { transaction: '123' },
    })

    const [row] = await migrator`
      select failure_reason, information, paid_amount_minor from payment_attempts where id = ${id}
    `
    expect(row).toEqual({
      failure_reason: 'declined',
      information: { transaction: '123' },
      paid_amount_minor: null,
    })
  })

  // An attempt of an expired order nobody confirmed is asked about at its provider once more,
  // and marked when it was: the application role writes that moment within its tenant.
  it('is marked once its provider was asked again after its order expired', async () => {
    const at = await place()
    const expired = await order(at, { status: 'expired', holds: false })
    const id = await attempt(at, expired, { status: 'ended' })

    await inTenant(
      at.tenant,
      (sql) => sql`update payment_attempts set rechecked_at = now() where id = ${id}`,
    )

    const [row] = await migrator<{ rechecked_at: Date | null }[]>`
      select rechecked_at from payment_attempts where id = ${id}
    `
    expect(row!.rechecked_at).toBeInstanceOf(Date)
  })

  // A provider that refused to register an attempt gave its last word of it at once: the mark
  // waits for no expiry, and is written as the attempt ends.
  it('is marked while its order awaits payment when its provider refused to register it', async () => {
    const at = await place()
    const id = await attempt(at, await order(at))

    await inTenant(
      at.tenant,
      (sql) =>
        sql`update payment_attempts set status = 'ended', rechecked_at = now() where id = ${id}`,
    )

    const [row] = await migrator<{ status: string; rechecked_at: Date | null }[]>`
      select status, rechecked_at from payment_attempts where id = ${id}
    `
    expect(row!.status).toBe('ended')
    expect(row!.rechecked_at).toBeInstanceOf(Date)
  })

  // The job that asks again finds its attempts across tenants, by identifiers and the moments
  // that say whether one is still to ask: nothing a provider said of a payment.
  it('is found across tenants while nobody confirmed it or asked again, by identifiers alone', async () => {
    const at = await place()
    const expired = await order(at, {
      status: 'expired',
      holds: false,
      hold_ends_at: '2026-01-01T00:00:00Z',
    })
    const [open, asked, confirmed] = [
      await attempt(at, expired, { status: 'ended' }),
      await attempt(at, expired, { status: 'ended', rechecked_at: new Date() }),
      await attempt(at, expired, { status: 'paid', confirmed_at: new Date() }),
    ]

    const found = await global<{ id: string; tenant_id: string }[]>`
      select a.id, a.tenant_id from payment_attempts a
      join orders o on o.id = a.order_id and o.tenant_id = a.tenant_id
      where a.id in ${global([open, asked, confirmed])} and o.status = 'expired'
        and a.confirmed_at is null and a.rechecked_at is null
    `

    expect(found).toEqual([{ id: open, tenant_id: at.tenant }])
    const reads = globalReads
      .filter((read) => read.startsWith('payment_attempts.'))
      .map((read) => read.split('.')[1])
    expect(reads.sort()).toEqual([
      'confirmed_at',
      'id',
      'order_id',
      'provider',
      'rechecked_at',
      'tenant_id',
    ])
    for (const column of [
      'status',
      'paid_amount_minor',
      'paid_at',
      'provider_reference',
      'failure_message',
      'information',
    ]) {
      await expect(
        global.unsafe(`select ${column} from payment_attempts limit 1`),
        column,
      ).rejects.toThrow(/permission denied/)
    }
    await expect(
      global.unsafe('update payment_attempts set rechecked_at = now() where false'),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('order_emails and order_links', () => {
  const email = (at: Place, orderId: string, values: Record<string, unknown> = {}) => {
    const row = {
      tenant_id: at.tenant,
      edition_id: at.edition,
      order_id: orderId,
      kind: 'order-confirmation',
      recipient: 'buyer@example.test',
      ...values,
    }
    return one(migrator`insert into order_emails ${migrator(row)} returning id`)
  }
  const link = (at: Place, orderId: string, hash: string) =>
    migrator`
      insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at)
      values (${at.tenant}, ${at.edition}, ${orderId}, ${hash}, '2099-01-01')
    `

  it('queues an email of an order of its own edition, not sent and never failed yet', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const id = await email(a, await order(a))

    const [row] = await migrator`
      select sent_at, failed_attempts, queued_at <= now() as queued, next_attempt_at <= now() as due
      from order_emails where id = ${id}
    `
    expect(row).toEqual({ sent_at: null, failed_attempts: 0, queued: true, due: true })
    for (const foreign of [b, await sibling(a)]) {
      await expect(email(a, await order(foreign))).rejects.toThrow(/order_emails_order_fk/)
    }
    await expect(email(a, await order(a), { kind: 'newsletter' })).rejects.toThrow(
      /order_email_kind/,
    )
  })

  // Order management (docs/specs/0006-order-management.md, F4): what a sent email said.
  it('keeps what an email said once it is sent: its subject and its text together', async () => {
    const at = await place()
    const mine = await order(at)
    const queued = await email(at, mine)
    const said = { subject: 'Your order is paid', body: 'Thank you.' }

    // The application role writes them as it marks the email sent, in its own tenant alone.
    await inTenant(
      at.tenant,
      (sql) =>
        sql`update order_emails set ${sql({ sent_at: new Date(), ...said })} where id = ${queued}`,
    )
    expect(await migrator`select subject, body from order_emails where id = ${queued}`).toEqual([
      said,
    ])
    const other = await place()
    await inTenant(other.tenant, (sql) => sql`update order_emails set body = 'Changed'`)
    expect(await migrator`select body from order_emails where id = ${queued}`).toEqual([
      { body: 'Thank you.' },
    ])

    // An email not sent yet said nothing, and a subject comes with its text.
    await expect(email(at, mine, said)).rejects.toThrow(/order_emails_said_once_sent/)
    for (const half of [{ subject: 'Your order is paid' }, { body: 'Thank you.' }]) {
      await expect(email(at, mine, { sent_at: new Date(), ...half })).rejects.toThrow(
        /"order_emails_said"/,
      )
    }
    // One sent before its text was kept stays listed without it.
    await email(at, mine, { sent_at: new Date() })
  })

  it('opens an order by the hash of a token, which no two links share', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const hash = 'e'.repeat(64)
    await link(a, await order(a), hash)

    await expect(link(a, await order(a), hash)).rejects.toThrow(/order_links_token_hash_unique/)
    for (const foreign of [b, await sibling(a)]) {
      await expect(link(a, await order(foreign), 'f'.repeat(64))).rejects.toThrow(
        /order_links_order_fk/,
      )
    }
  })
})

describe('what the application role changes of an order', () => {
  it('never changes what an order is, costs or belongs to', async () => {
    const at = await place()
    const [mine, standard] = [await order(at), await ticketType(at)]
    await ticketLine(at, mine, standard)
    await attempt(at, mine)

    for (const statement of [
      `update orders set number = 'ZZZZZZZZZZ'`,
      `update orders set total_minor = 1`,
      `update orders set edition_id = '${at.edition}'`,
      // What a manual order is recorded with is written once.
      `update orders set manual_reason = 'desk'`,
      `update orders set note = 'changed'`,
      `update orders set placed_at = now()`,
      // The key an order was placed with is written once, with the order.
      `update orders set placement_key_hash = '${HASH}'`,
      `update order_lines set amount_minor = 1`,
      `update order_lines set unit_amount_minor = 1`,
      `update order_lines set quantity = 5`,
      `update order_lines set ticket_type_id = '${standard}'`,
      `update order_lines set merchandise_item_id = '${standard}'`,
      `update order_lines set order_id = '${mine}'`,
      `update order_qr_codes set code = 'other'`,
      `update order_qr_codes set code_hash = '${HASH}'`,
      `update order_qr_code_orders set qr_code_id = '${mine}'`,
      `update order_links set expires_at = now()`,
      `update order_links set token_hash = '${HASH}'`,
      `update payment_attempts set amount_minor = 1`,
      `update payment_attempts set order_id = '${mine}'`,
      `delete from orders`,
      `delete from order_lines`,
      `delete from payment_attempts`,
      `delete from order_qr_codes`,
      `delete from order_links`,
      `delete from order_emails`,
    ]) {
      await expect(inTenant(at.tenant, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
    // What a payment changes still changes.
    await inTenant(at.tenant, async (sql) => {
      await sql`update orders set status = 'paid', paid_at = now(), holds = true, hold_ends_at = null`
      await sql`update payment_attempts set status = 'paid', paid_amount_minor = 10000, paid_at = now()`
    })
  })

  // A checkout sent again is answered with its order and a new result token, which takes the
  // place of the one whose answer never arrived.
  it('gives an order another result token', async () => {
    const at = await place()
    const mine = await order(at)

    await inTenant(
      at.tenant,
      (sql) => sql`update orders set result_token_hash = ${'b'.repeat(64)} where id = ${mine}`,
    )

    const [row] = await migrator<{ hash: string }[]>`
      select result_token_hash as hash from orders where id = ${mine}
    `
    expect(row!.hash).toBe('b'.repeat(64))
  })

  // Order management (docs/specs/0006-order-management.md): what an org corrects, cancels,
  // settles and hands out.
  it('changes what an org corrects, settles and hands out', async () => {
    const at = await place()
    const mine = await order(at)
    const pin = await item(at)
    await line(at, mine, {
      kind: 'merchandise',
      merchandise_item_id: pin.id,
      merchandise_variant_id: pin.variant,
    })
    const [code] = await migrator<{ id: string }[]>`
      insert into order_qr_codes (tenant_id, edition_id, code_hash, code)
      values (${at.tenant}, ${at.edition}, ${'a'.repeat(64)}, 'sealed') returning id
    `
    await migrator`
      insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
      values (${at.tenant}, ${at.edition}, ${mine}, ${code!.id})
    `
    await migrator`
      insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at)
      values (${at.tenant}, ${at.edition}, ${mine}, ${'b'.repeat(64)}, now() + interval '1 day')
    `

    await inTenant(at.tenant, async (sql) => {
      await sql`update orders set holder_name = 'Corrected', email = 'new@example.test'`
      await sql`update orders set status = 'needs-review', review_cause = 'amount'`
      await sql`update orders set status = 'declined', declined_at = now(), decline_reason = 'A reason', holds = false`
      await sql`update orders set status = 'canceled', canceled_at = now(), cancel_reason = 'A reason'`
      await sql`update order_lines set handed_out_at = now()`
      await sql`update order_lines set handed_out_at = null`
      // A changed email: the old code is marked replaced and let go of, the old link ended.
      await sql`update order_qr_codes set replaced_at = now()`
      await sql`delete from order_qr_code_orders`
      await sql`update order_links set ended_at = now()`
    })
    // An email that would hand the order over to an address it has left is withdrawn, not sent.
    await migrator`
      insert into order_emails (tenant_id, edition_id, order_id, kind, recipient)
      values (${at.tenant}, ${at.edition}, ${mine}, 'order-confirmation', 'old@example.test')
    `
    await inTenant(at.tenant, (sql) => sql`update order_emails set withdrawn_at = now()`)
    await expect(
      inTenant(at.tenant, (sql) => sql`update order_emails set recipient = 'new@example.test'`),
    ).rejects.toThrow(/permission denied/)

    const [stored] = await migrator`
      select holder_name, email, status, review_cause, cancel_reason, decline_reason
      from orders where id = ${mine}
    `
    expect(stored).toEqual({
      holder_name: 'Corrected',
      email: 'new@example.test',
      status: 'canceled',
      review_cause: 'amount',
      cancel_reason: 'A reason',
      decline_reason: 'A reason',
    })
  })

  // A swap moves a line to another variant of the item it names: its foreign key keeps it there.
  it('swaps the variant of a line within its item alone', async () => {
    const at = await place()
    const mine = await order(at)
    const [pin, other] = [await item(at), await item(at)]
    const [second] = await migrator<{ id: string }[]>`
      insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
      values (${at.tenant}, ${at.edition}, ${pin.id}, 5) returning id
    `
    await line(at, mine, {
      kind: 'merchandise',
      merchandise_item_id: pin.id,
      merchandise_variant_id: pin.variant,
    })

    await inTenant(
      at.tenant,
      (sql) => sql`update order_lines set merchandise_variant_id = ${second!.id}`,
    )
    await expect(
      inTenant(
        at.tenant,
        (sql) => sql`update order_lines set merchandise_variant_id = ${other.variant}`,
      ),
    ).rejects.toThrow(/order_lines_variant_fk/)
  })

  it('records a manual order with its reason and a note, and nobody\u2019s email', async () => {
    const at = await place()

    const manual = await order(at, {
      status: 'paid-manual',
      email: null,
      manual_reason: 'desk',
      note: 'Paid in cash',
      hold_ends_at: null,
    })
    expect(manual).toBeDefined()
    // A manual order is recorded by an org at the desk: it has a reason, and no email.
    await expect(
      order(at, { status: 'paid-manual', email: null, hold_ends_at: null }),
    ).rejects.toThrow(/orders_manual_reason/)
    await expect(order(at, { manual_reason: 'invoice' })).rejects.toThrow(/orders_manual_no_email/)
    await expect(order(at, { manual_reason: 'gift', email: null })).rejects.toThrow(
      /manual_order_reason/,
    )
    await expect(order(at, { note: 'n'.repeat(501) })).rejects.toThrow(/orders_note/)
    await expect(order(at, { cancel_reason: ' ' })).rejects.toThrow(/orders_cancel_reason/)
    await expect(order(at, { decline_reason: '' })).rejects.toThrow(/orders_decline_reason/)
  })

  // Nobody has to be named: a manual order asks for no name (M4), and a buyer of the shop gives
  // one only when they want to.
  it('takes an order with no name, of the shop and manual alike', async () => {
    const at = await place()
    const manual = { status: 'paid-manual', email: null, manual_reason: 'desk', hold_ends_at: null }

    await order(at, { ...manual, holder_name: '' })
    await order(at, { ...manual, holder_name: 'Ada' })
    await order(at, { holder_name: '' })
    await order(at, { holder_name: '', age_band: null })
    await expect(order(at, { ...manual, holder_name: 'n'.repeat(201) })).rejects.toThrow(
      /orders_holder_name/,
    )
  })

  // What order management tells a buyer (docs/specs/0006-order-management.md, Emails).
  it.each([
    'order-holder-changed',
    'order-variant-changed',
    'order-email-changed',
    'order-email-replaced',
    'order-declined',
    'order-canceled',
    // A fresh order link for one that expired (docs/specs/0009-buyer-self-service.md, K4).
    'order-link',
    // The reminder before the edition (docs/specs/0011-pre-edition-reminder.md).
    'pre-edition-reminder',
  ])('queues the email %s of an order', async (kind) => {
    const at = await place()
    const mine = await order(at)

    await migrator`
      insert into order_emails (tenant_id, edition_id, order_id, kind, recipient)
      values (${at.tenant}, ${at.edition}, ${mine}, ${kind}, 'buyer@example.test')
    `
    expect(await migrator`select kind from order_emails where order_id = ${mine}`).toEqual([
      { kind },
    ])
  })
})
