import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createEdition,
  createProgramItem,
  createTenant,
  createUser,
  freshApp,
  global,
  inTenant,
  migrator,
  supabaseAdmin,
} from './db'
import { globalReads, verifyDatabase } from '../src/verify'

// Every covered table and the column that holds its tenant.
const covered = [
  ['tenants', 'id'],
  ['tenant_memberships', 'tenant_id'],
  ['editions', 'tenant_id'],
  ['edition_memberships', 'tenant_id'],
  ['accepted_invitations', 'tenant_id'],
  ['program_items', 'tenant_id'],
  ['program_item_speakers', 'tenant_id'],
  ['program_item_likes', 'tenant_id'],
  ['uploaded_files', 'tenant_id'],
  ['tenant_logos', 'tenant_id'],
  ['shop_sellers', 'tenant_id'],
  ['payment_provider_accounts', 'tenant_id'],
  ['edition_shops', 'tenant_id'],
  ['edition_documents', 'tenant_id'],
  ['edition_document_versions', 'tenant_id'],
  ['edition_consents', 'tenant_id'],
  ['ticket_types', 'tenant_id'],
  ['ticket_type_price_tiers', 'tenant_id'],
  ['ticket_type_supporter_prices', 'tenant_id'],
  ['ticket_type_perks', 'tenant_id'],
  ['add_ons', 'tenant_id'],
  ['ticket_type_add_ons', 'tenant_id'],
  ['merchandise_items', 'tenant_id'],
  ['ticket_type_merchandise_items', 'tenant_id'],
  ['merchandise_option_axes', 'tenant_id'],
  ['merchandise_option_values', 'tenant_id'],
  ['merchandise_variants', 'tenant_id'],
  ['merchandise_variant_values', 'tenant_id'],
  ['merchandise_item_pictures', 'tenant_id'],
  ['merchandise_size_charts', 'tenant_id'],
  ['edition_custom_fields', 'tenant_id'],
  ['orders', 'tenant_id'],
  ['order_lines', 'tenant_id'],
  ['order_custom_field_answers', 'tenant_id'],
  ['order_consents', 'tenant_id'],
  ['order_accounts', 'tenant_id'],
  ['order_qr_codes', 'tenant_id'],
  ['order_qr_code_orders', 'tenant_id'],
  ['payment_attempts', 'tenant_id'],
  ['order_emails', 'tenant_id'],
  ['order_links', 'tenant_id'],
  ['scanner_devices', 'tenant_id'],
  ['discount_codes', 'tenant_id'],
  ['discount_code_ticket_types', 'tenant_id'],
  ['discount_code_add_ons', 'tenant_id'],
  ['discount_code_merchandise_items', 'tenant_id'],
] as const

class Rollback extends Error {}

let a: Awaited<ReturnType<typeof createTenant>>
let b: Awaited<ReturnType<typeof createTenant>>

/**
 * A tenant with a row in every covered table: its head membership, an edition, its access, an
 * accepted invitation, a programme item with a speaker and a like, an uploaded file, a logo, and
 * the setup of its shop: the seller, a provider account, the edition's shop, a document with a
 * version and a consent, and a catalog: a ticket type with a tier, a supporter price and a perk,
 * an add-on and an item it offers, the item's axis, value, variant, picture and size chart, and a
 * custom field, and an order: with a line, an answer, a consent, an account, a QR code, a payment
 * attempt, an email and a link.
 */
async function populated() {
  const tenant = await createTenant()
  const edition = await createEdition(tenant.id)
  await migrator`
    insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
    select ${tenant.id}, id, ${edition} from tenant_memberships where tenant_id = ${tenant.id}
  `
  await migrator`
    insert into accepted_invitations (tenant_id, jti) values (${tenant.id}, gen_random_uuid())
  `
  const item = await createProgramItem(tenant.id, edition)
  await migrator`
    insert into program_item_speakers (tenant_id, program_item_id, account_id)
    values (${tenant.id}, ${item}, ${tenant.headId})
  `
  await migrator`
    insert into program_item_likes (tenant_id, program_item_id, account_id)
    values (${tenant.id}, ${item}, ${tenant.headId})
  `
  await migrator`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
    values (${tenant.id}, ${edition}, 'test', 'application/pdf', 1, ${'0'.repeat(64)}, 'a.pdf')
  `
  const [logo] = await migrator<{ id: string }[]>`
    insert into uploaded_files (tenant_id, kind, content_type, size, sha256, name, width, height)
    values (${tenant.id}, 'convention-logo', 'image/png', 1, ${'0'.repeat(64)}, 'logo.png', 4, 3)
    returning id
  `
  await migrator`insert into tenant_logos (tenant_id, file_id) values (${tenant.id}, ${logo!.id})`
  await migrator`insert into shop_sellers (tenant_id, seller_name) values (${tenant.id}, 'Seller')`
  await migrator`
    insert into payment_provider_accounts (tenant_id, provider, credentials)
    values (${tenant.id}, 'fake', 'sealed')
  `
  await migrator`insert into edition_shops (tenant_id, edition_id) values (${tenant.id}, ${edition})`
  const [terms] = await migrator<{ id: string }[]>`
    insert into edition_documents (tenant_id, edition_id, kind, title)
    values (${tenant.id}, ${edition}, 'shop-terms', 'Terms')
    returning id
  `
  const [termsFile] = await migrator<{ id: string }[]>`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
    values (${tenant.id}, ${edition}, 'edition-document', 'application/pdf', 1, ${'0'.repeat(64)}, 't.pdf')
    returning id
  `
  await migrator`
    insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
    values (${tenant.id}, ${edition}, ${terms!.id}, 1, ${termsFile!.id})
  `
  await migrator`
    insert into edition_consents (tenant_id, edition_id, document_id, text, is_required, position)
    values (${tenant.id}, ${edition}, ${terms!.id}, 'I accept the terms.', true, 1)
  `
  await catalog(tenant.id, edition)
  return tenant
}

/** A row in every table of the catalog (docs/specs/0003-catalog.md). */
async function catalog(tenantId: string, edition: string) {
  const at = { tenant_id: tenantId, edition_id: edition }
  const add = async (table: string, values: Record<string, unknown>, returning = 'id') => {
    const [row] = await migrator<Record<string, string>[]>`
      insert into ${migrator(table)} ${migrator({ ...at, ...values })}
      returning ${migrator(returning)}
    `
    return row![returning]!
  }
  const ticketType = await add('ticket_types', {
    name: 'Standard',
    sale_starts_at: '2026-01-01',
    sale_ends_at: '2026-06-01',
    allows_child: false,
    allows_teen: true,
    allows_adult: true,
    position: 1,
  })
  const ofType = { ticket_type_id: ticketType }
  await add('ticket_type_price_tiers', {
    ...ofType,
    amount_minor: 10000,
    starts_at: '2026-01-01',
    ends_at: '2026-06-01',
  })
  await add('ticket_type_supporter_prices', { ...ofType, amount_minor: 20000 })
  await add('ticket_type_perks', { ...ofType, name: 'A pin', position: 1 })
  const addOn = await add('add_ons', {
    name: 'Sleeping room',
    amount_minor: 0,
    kind: 'headcount',
    position: 1,
  })
  await add('ticket_type_add_ons', { ...ofType, add_on_id: addOn }, 'add_on_id')
  const item = await add('merchandise_items', {
    name: 'T-shirt',
    amount_minor: 8000,
    per_order_limit: 5,
    position: 1,
  })
  const ofItem = { merchandise_item_id: item }
  await add('ticket_type_merchandise_items', { ...ofType, ...ofItem }, 'merchandise_item_id')
  const axis = await add('merchandise_option_axes', { ...ofItem, name: 'Size', position: 1 })
  const value = await add('merchandise_option_values', {
    ...ofItem,
    axis_id: axis,
    label: 'M',
    position: 1,
  })
  const variant = await add('merchandise_variants', { ...ofItem, stock: 3 })
  await add(
    'merchandise_variant_values',
    { ...ofItem, variant_id: variant, axis_id: axis, option_value_id: value },
    'variant_id',
  )
  const image = (kind: string) =>
    add('uploaded_files', {
      kind,
      content_type: 'image/png',
      size: 1,
      sha256: '0'.repeat(64),
      name: 'p.png',
      width: 4,
      height: 3,
    })
  await add('merchandise_item_pictures', {
    ...ofItem,
    file_id: await image('merchandise-picture'),
    position: 1,
  })
  await add(
    'merchandise_size_charts',
    { option_value_id: value, file_id: await image('merchandise-size-chart') },
    'option_value_id',
  )
  const field = await add('edition_custom_fields', {
    label: 'Fandom',
    is_required: false,
    position: 1,
  })
  await order(tenantId, edition, { ticketType, field })
}

/** A row in every table of an order (docs/specs/0004-checkout-and-orders.md). */
async function order(
  tenantId: string,
  edition: string,
  catalog: { ticketType: string; field: string },
) {
  const at = { tenant_id: tenantId, edition_id: edition }
  const add = async (table: string, values: Record<string, unknown>, returning = 'id') => {
    const [row] = await migrator<Record<string, string>[]>`
      insert into ${migrator(table)} ${migrator({ ...at, ...values })}
      returning ${migrator(returning)}
    `
    return row![returning]!
  }
  const id = await add('orders', {
    // Ten characters of the order's alphabet, from the tenant's own identifier.
    number: tenantId
      .replace(/[^2-9a-f]/g, '')
      .slice(0, 10)
      .toUpperCase()
      .padEnd(10, '2'),
    status: 'awaiting-payment',
    email: 'buyer@example.test',
    holder_name: 'Ada',
    age_band: 'adult',
    total_minor: 10000,
    holds: true,
    result_token_hash: '0'.repeat(64),
  })
  const ofOrder = { order_id: id }
  await add('order_lines', {
    ...ofOrder,
    kind: 'ticket',
    ticket_type_id: catalog.ticketType,
    quantity: 1,
    unit_amount_minor: 10000,
    amount_minor: 10000,
  })
  await add(
    'order_custom_field_answers',
    { ...ofOrder, custom_field_id: catalog.field, answer: 'Tolkien' },
    'order_id',
  )
  const [consent] = await migrator<{ id: string }[]>`
    select id from edition_consents where tenant_id = ${tenantId} limit 1
  `
  await add('order_consents', { ...ofOrder, consent_id: consent!.id }, 'order_id')
  const [head] = await migrator<{ account_id: string }[]>`
    select account_id from tenant_memberships where tenant_id = ${tenantId} limit 1
  `
  await add('order_accounts', { ...ofOrder, account_id: head!.account_id }, 'order_id')
  const code = await add('order_qr_codes', { code_hash: `${id}-hash`, code: 'sealed' })
  await add('order_qr_code_orders', { ...ofOrder, qr_code_id: code }, 'order_id')
  await add('payment_attempts', {
    ...ofOrder,
    provider: 'fake',
    status: 'started',
    amount_minor: 10000,
  })
  await add('order_emails', {
    ...ofOrder,
    kind: 'order-confirmation',
    recipient: 'buyer@example.test',
  })
  await add('order_links', {
    ...ofOrder,
    token_hash: `${id}-token`,
    expires_at: '2099-01-01',
  })
  await add('scanner_devices', {
    name: 'Gate',
    pairing_code_hash: `${id}-pairing`,
    pairing_expires_at: '2099-01-01',
    expires_at: '2099-01-01',
  })
  // A discount code with one row of each thing it applies to
  // (docs/specs/0008-discount-codes.md).
  const discountCode = await add('discount_codes', {
    code: 'guest-2026',
    kind: 'percent',
    percent: 100,
    valid_from: '2020-01-01',
    valid_until: '2099-01-01',
  })
  const ofCode = { discount_code_id: discountCode }
  await add(
    'discount_code_ticket_types',
    { ...ofCode, ticket_type_id: catalog.ticketType },
    'ticket_type_id',
  )
  const [addOn] = await migrator<{ id: string }[]>`
    select id from add_ons where tenant_id = ${tenantId} limit 1
  `
  await add('discount_code_add_ons', { ...ofCode, add_on_id: addOn!.id }, 'add_on_id')
  const [item] = await migrator<{ id: string }[]>`
    select id from merchandise_items where tenant_id = ${tenantId} limit 1
  `
  await add(
    'discount_code_merchandise_items',
    { ...ofCode, merchandise_item_id: item!.id },
    'merchandise_item_id',
  )
}

beforeAll(async () => {
  ;[a, b] = await Promise.all([populated(), populated()])
})

/**
 * An insert into each table of the catalog, written for the tenant `tenantId` with the rows that
 * tenant already holds: what another tenant's transaction must be refused.
 */
async function foreignCatalogRows(tenantId: string, edition: string) {
  const held = async (table: string, column = 'id') => {
    const [row] = await migrator.unsafe<Record<string, string>[]>(
      `select ${column} from ${table} where tenant_id = '${tenantId}' limit 1`,
    )
    return row![column]!
  }
  const at = `'${tenantId}', '${edition}'`
  const [ticketType, addOn, item, axis, value, variant] = await Promise.all(
    [
      'ticket_types',
      'add_ons',
      'merchandise_items',
      'merchandise_option_axes',
      'merchandise_option_values',
      'merchandise_variants',
    ].map((table) => held(table)),
  )
  const [file] = await migrator<{ id: string }[]>`
    insert into uploaded_files
      (tenant_id, edition_id, kind, content_type, size, sha256, name, width, height)
    values (${tenantId}, ${edition}, 'merchandise-picture', 'image/png', 1, ${'0'.repeat(64)},
      'f.png', 4, 3)
    returning id
  `
  return [
    `insert into ticket_types (tenant_id, edition_id, name, sale_starts_at, sale_ends_at,
       allows_child, allows_teen, allows_adult, position)
     values (${at}, 'Foreign', '2026-01-01', '2026-06-01', true, true, true, 9)`,
    `insert into ticket_type_price_tiers
       (tenant_id, edition_id, ticket_type_id, amount_minor, starts_at, ends_at)
     values (${at}, '${ticketType}', 1, '2027-01-01', '2027-06-01')`,
    `insert into ticket_type_supporter_prices (tenant_id, edition_id, ticket_type_id, amount_minor)
     values (${at}, '${ticketType}', 99900)`,
    `insert into ticket_type_perks (tenant_id, edition_id, ticket_type_id, name, position)
     values (${at}, '${ticketType}', 'Foreign', 9)`,
    `insert into add_ons (tenant_id, edition_id, name, amount_minor, kind, position)
     values (${at}, 'Foreign', 0, 'unlimited', 9)`,
    `insert into merchandise_items (tenant_id, edition_id, name, amount_minor, per_order_limit,
       position)
     values (${at}, 'Foreign', 0, 1, 9)`,
    `insert into merchandise_option_axes (tenant_id, edition_id, merchandise_item_id, name, position)
     values (${at}, '${item}', 'Foreign', 9)`,
    `insert into merchandise_option_values
       (tenant_id, edition_id, merchandise_item_id, axis_id, label, position)
     values (${at}, '${item}', '${axis}', 'Foreign', 9)`,
    `insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id)
     values (${at}, '${item}')`,
    `insert into merchandise_item_pictures
       (tenant_id, edition_id, merchandise_item_id, file_id, position)
     values (${at}, '${item}', '${file!.id}', 9)`,
    `insert into edition_custom_fields (tenant_id, edition_id, label, is_required, position)
     values (${at}, 'Foreign', false, 9)`,
    // The three below would also break a key of their own; RLS refuses them before it is checked.
    `insert into ticket_type_add_ons (tenant_id, edition_id, ticket_type_id, add_on_id)
     values (${at}, '${ticketType}', '${addOn}')`,
    `insert into ticket_type_merchandise_items
       (tenant_id, edition_id, ticket_type_id, merchandise_item_id)
     values (${at}, '${ticketType}', '${item}')`,
    `insert into merchandise_variant_values
       (tenant_id, edition_id, merchandise_item_id, variant_id, axis_id, option_value_id)
     values (${at}, '${item}', '${variant}', '${axis}', '${value}')`,
    `insert into merchandise_size_charts (tenant_id, edition_id, option_value_id, file_id)
     values (${at}, '${value}', '${file!.id}')`,
  ]
}

/**
 * An insert into each table of an order, written for the tenant `tenantId` with the rows that
 * tenant already holds: what another tenant's transaction must be refused.
 */
async function foreignOrderRows(tenantId: string, edition: string) {
  const held = async (table: string, column = 'id') => {
    const [row] = await migrator.unsafe<Record<string, string>[]>(
      `select ${column} from ${table} where tenant_id = '${tenantId}' limit 1`,
    )
    return row![column]!
  }
  const at = `'${tenantId}', '${edition}'`
  const [order, addOn, code] = await Promise.all(
    ['orders', 'add_ons', 'order_qr_codes'].map((table) => held(table)),
  )
  const account = await held('tenant_memberships', 'account_id')
  // An order of the tenant's own that holds none of the rows the inserts below add.
  const [bare] = await migrator<{ id: string }[]>`
    insert into orders (tenant_id, edition_id, number, status, holder_name, total_minor, holds,
      result_token_hash, manual_reason)
    values (${tenantId}, ${edition}, 'ZZZZZZZZZZ', 'paid-manual', 'Ada', 0, true, ${'0'.repeat(64)},
      'desk')
    returning id
  `
  return [
    `insert into orders (tenant_id, edition_id, number, status, holder_name, total_minor, holds,
       result_token_hash, manual_reason)
     values (${at}, 'YYYYYYYYYY', 'paid-manual', 'Foreign', 0, true, repeat('0', 64), 'desk')`,
    `insert into order_lines (tenant_id, edition_id, order_id, kind, add_on_id, quantity,
       unit_amount_minor, amount_minor)
     values (${at}, '${order}', 'add_on', '${addOn}', 1, 0, 0)`,
    `insert into order_qr_codes (tenant_id, edition_id, code_hash, code)
     values (${at}, 'foreign-hash', 'sealed')`,
    `insert into payment_attempts (tenant_id, edition_id, order_id, provider, status, amount_minor)
     values (${at}, '${order}', 'fake', 'started', 1)`,
    `insert into order_emails (tenant_id, edition_id, order_id, kind, recipient)
     values (${at}, '${order}', 'order-expired', 'foreign@example.test')`,
    `insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at)
     values (${at}, '${order}', 'foreign-token', '2099-01-01')`,
    `insert into scanner_devices (tenant_id, edition_id, name, pairing_code_hash,
       pairing_expires_at, expires_at)
     values (${at}, 'Foreign gate', 'foreign-pairing', '2099-01-01', '2099-01-01')`,
    `insert into discount_codes (tenant_id, edition_id, code, kind, percent, valid_from,
       valid_until)
     values (${at}, 'foreign-code', 'percent', 10, '2020-01-01', '2099-01-01')`,
    `insert into discount_code_ticket_types (tenant_id, edition_id, discount_code_id,
       ticket_type_id)
     values (${at}, '${await held('discount_codes')}', '${await held('ticket_types')}')`,
    `insert into discount_code_add_ons (tenant_id, edition_id, discount_code_id, add_on_id)
     values (${at}, '${await held('discount_codes')}', '${await held('add_ons')}')`,
    `insert into discount_code_merchandise_items (tenant_id, edition_id, discount_code_id,
       merchandise_item_id)
     values (${at}, '${await held('discount_codes')}', '${await held('merchandise_items')}')`,
    `insert into order_custom_field_answers (tenant_id, edition_id, order_id, custom_field_id,
       answer)
     values (${at}, '${bare!.id}', '${await held('edition_custom_fields')}', 'Foreign')`,
    `insert into order_consents (tenant_id, edition_id, order_id, consent_id)
     values (${at}, '${bare!.id}', '${await held('edition_consents')}')`,
    `insert into order_accounts (tenant_id, edition_id, order_id, account_id)
     values (${at}, '${bare!.id}', '${account}')`,
    `insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
     values (${at}, '${bare!.id}', '${code}')`,
  ]
}

describe('coverage', () => {
  // A new tenant table fails here until it joins `covered`, and with it every test below.
  it('lists every tenant table of the catalog', async () => {
    const tables = await migrator<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and (c.relname = 'tenants' or exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
        ))
      order by 1
    `
    expect(tables.map((t) => t.relname)).toEqual(covered.map(([table]) => table).sort())
  })

  // RLS filters on the tenant column of every query, so an index must start with it.
  it.each(covered)(
    'holds an index on %s that starts with its tenant column',
    async (table, column) => {
      const [row] = await migrator<{ indexed: boolean }[]>`
      select exists (
        select 1 from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = ${'public.' + table}::regclass and a.attname = ${column}
      ) as indexed
    `
      expect(row!.indexed).toBe(true)
    },
  )
})

describe('tenant isolation', () => {
  // On a session that never set app.tenant_id, only a policy without missing_ok raises this. A
  // reused session would hold '' and fail with a uuid error even under missing_ok.
  it.each(covered)('rejects a query on %s without a tenant context', async (table) => {
    const sql = freshApp()
    try {
      await expect(sql.unsafe(`select 1 from ${table}`)).rejects.toThrow(
        /unrecognized configuration parameter "app\.tenant_id"/,
      )
    } finally {
      await sql.end()
    }
  })

  it.each(covered)('shows only the rows of the tenant in context on %s', async (table, column) => {
    const rows = await inTenant(b.id, (sql) =>
      sql.unsafe<{ tenant: string }[]>(`select ${column} as tenant from ${table}`),
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.tenant === b.id)).toBe(true)
  })

  // opos_app may not update tenant_id at all, so the privilege refuses before WITH CHECK would.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses to move a row of %s to another tenant',
    async (table) => {
      await expect(
        inTenant(b.id, (sql) =>
          sql.unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`),
        ),
      ).rejects.toThrow(/permission denied/)
    },
  )

  // A role that may update tenant_id, created and dropped inside the test: only the policy's
  // WITH CHECK stands between it and moving a visible row to another tenant.
  // The role, its grants and the update live in one transaction that always rolls back, so a
  // policy that lets the update through leaves nothing behind for the next run.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses through WITH CHECK to move a row of %s to another tenant',
    async (table) => {
      let refusal: unknown
      await supabaseAdmin
        .begin(async (sql) => {
          await sql.unsafe(`
            create role rls_probe nologin;
            grant usage on schema public to rls_probe;
            grant select, update (tenant_id) on public.${table} to rls_probe;
            set local role rls_probe;
          `)
          await sql`select set_config('app.tenant_id', ${b.id}, true)`
          refusal = await sql
            .unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`)
            .catch((error: unknown) => error)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })
      expect(String(refusal)).toMatch(/new row violates row-level security policy/)
    },
  )

  // The same on insert, for every table whether or not opos_app inserts into it yet. WITH CHECK
  // runs before the constraints, so the row needs nothing but its tenant.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses through WITH CHECK to insert a row of another tenant into %s',
    async (table) => {
      let refusal: unknown
      await supabaseAdmin
        .begin(async (sql) => {
          await sql.unsafe(`
            create role rls_probe nologin;
            grant usage on schema public to rls_probe;
            grant insert on public.${table} to rls_probe;
            set local role rls_probe;
          `)
          await sql`select set_config('app.tenant_id', ${b.id}, true)`
          refusal = await sql
            .unsafe(`insert into ${table} (tenant_id) values ('${a.id}')`)
            .catch((error: unknown) => error)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })
      expect(String(refusal)).toMatch(/new row violates row-level security policy/)
    },
  )

  it.each(covered)('updates no row of another tenant in %s', async (table, column) => {
    const [updatable] = await migrator<{ column: string }[]>`
      select a.attname as column
      from pg_attribute a
      where a.attrelid = ${'public.' + table}::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('opos_app', a.attrelid, a.attnum, 'UPDATE')
      order by a.attnum
      limit 1
    `
    if (!updatable) return
    const changed = await inTenant(b.id, (sql) =>
      sql.unsafe(
        `update ${table} set ${updatable.column} = ${updatable.column} where ${column} = '${a.id}'`,
      ),
    )
    expect(changed.count).toBe(0)
  })

  it.each(covered)('deletes no row of another tenant in %s', async (table, column) => {
    const [privilege] = await migrator<{ deletable: boolean }[]>`
      select has_table_privilege('opos_app', ${'public.' + table}, 'DELETE') as deletable
    `
    if (!privilege?.deletable) return
    const before = await migrator.unsafe(`select 1 from ${table} where ${column} = '${a.id}'`)
    const deleted = await inTenant(b.id, (sql) =>
      sql.unsafe(`delete from ${table} where ${column} = '${a.id}'`),
    )

    expect(deleted.count).toBe(0)
    const after = await migrator.unsafe(`select 1 from ${table} where ${column} = '${a.id}'`)
    expect(after.length).toBe(before.length)
  })

  // A pooled session keeps app.tenant_id as '' once a transaction has set it; a query outside a
  // transaction then fails on the uuid cast instead of reading the last tenant's rows.
  it('lets a session reused after a tenant transaction read no tenant', async () => {
    const sql = freshApp()
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${a.id}, true)`
        await tx`select 1 from editions`
      })
      await expect(sql`select id from editions`).rejects.toThrow(
        /invalid input syntax for type uuid/,
      )
    } finally {
      await sql.end()
    }
  })

  // The tables opos_app inserts into; WITH CHECK refuses a row of another tenant in each.
  it('rejects an insert with another tenant id', async () => {
    const [membership] = await migrator<{ id: string }[]>`
      select id from tenant_memberships where tenant_id = ${a.id}
    `
    const [edition] = await migrator<{ id: string }[]>`
      select id from editions where tenant_id = ${a.id}
    `
    const [item] = await migrator<{ id: string }[]>`
      select id from program_items where tenant_id = ${a.id}
    `
    const [file] = await migrator<{ id: string }[]>`
      select id from uploaded_files where tenant_id = ${a.id} and kind = 'test'
    `
    const [document] = await migrator<{ id: string }[]>`
      select id from edition_documents where tenant_id = ${a.id}
    `
    // An account without a membership in a: only WITH CHECK can refuse it.
    const outsider = await createUser()

    for (const statement of [
      `insert into tenant_memberships (account_id, tenant_id, role)
       values ('${outsider.id}', '${a.id}', 'org')`,
      `insert into editions (tenant_id, slug, name, starts_at, ends_at)
       values ('${a.id}', 'foreign', 'Foreign', '2026-06-01', '2026-06-03')`,
      `insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
       values ('${a.id}', '${membership!.id}', '${edition!.id}')`,
      `insert into accepted_invitations (tenant_id, jti) values ('${a.id}', gen_random_uuid())`,
      `insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
       values ('${a.id}', '${edition!.id}', 'Foreign', '2026-06-01', '2026-06-02')`,
      `insert into program_item_speakers (tenant_id, program_item_id, account_id)
       values ('${a.id}', '${item!.id}', '${outsider.id}')`,
      `insert into program_item_likes (tenant_id, program_item_id, account_id)
       values ('${a.id}', '${item!.id}', '${outsider.id}')`,
      `insert into uploaded_files (tenant_id, kind, content_type, size, sha256, name)
       values ('${a.id}', 'test', 'image/png', 1, repeat('0', 64), 'a.png')`,
      `insert into tenant_logos (tenant_id, file_id) values ('${a.id}', '${file!.id}')`,
      `insert into shop_sellers (tenant_id) values ('${a.id}')`,
      `insert into payment_provider_accounts (tenant_id, provider, credentials)
       values ('${a.id}', 'fake', 'sealed')`,
      `insert into edition_shops (tenant_id, edition_id) values ('${a.id}', '${edition!.id}')`,
      `insert into edition_documents (tenant_id, edition_id, kind, title)
       values ('${a.id}', '${edition!.id}', 'other', 'Foreign')`,
      `insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
       values ('${a.id}', '${edition!.id}', '${document!.id}', 9, '${file!.id}')`,
      `insert into edition_consents (tenant_id, edition_id, text, is_required, position)
       values ('${a.id}', '${edition!.id}', 'Foreign', false, 9)`,
      ...(await foreignCatalogRows(a.id, edition!.id)),
      ...(await foreignOrderRows(a.id, edition!.id)),
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /row-level security/,
      )
    }
  })

  it.each(['anon', 'authenticated', 'service_role'])(
    'gives %s no privilege on any public table',
    async (role) => {
      const held = await migrator`
        select c.relname, p.privilege
        from pg_class c
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
          and has_table_privilege(${role}, c.oid, p.privilege)
      `
      expect(held).toEqual([])
    },
  )

  it('revokes the Supabase API roles from the core tables in its own migration', async () => {
    const statements = readFileSync(
      join(import.meta.dirname, '../drizzle/0020_revoke_api_roles_from_core.sql'),
      'utf8',
    ).split('--> statement-breakpoint')
    const held = await migrator
      .begin(async (sql) => {
        // What a project that ran no db:roles before the first migration hands out by default.
        for (const role of ['anon', 'authenticated', 'service_role']) {
          await sql.unsafe(
            `grant all on accounts, tenants, tenant_memberships, editions, edition_memberships to ${role}`,
          )
        }
        for (const statement of statements) await sql.unsafe(statement)
        const rows = await sql`
          select r.role, c.relname from pg_class c
          cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
          where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
            and c.relname in ('accounts', 'tenants', 'tenant_memberships', 'editions', 'edition_memberships')
            and has_table_privilege(r.role, c.oid, 'SELECT')
        `
        throw Object.assign(new Rollback(), { rows })
      })
      .catch((error: unknown) => {
        if (error instanceof Rollback) return (error as Rollback & { rows: unknown[] }).rows
        throw error
      })
    expect(held).toEqual([])
  })

  it('revokes the Supabase API roles from the functions of public in its own migration', async () => {
    const statements = readFileSync(
      join(import.meta.dirname, '../drizzle/0024_revoke_api_roles_from_functions.sql'),
      'utf8',
    ).split('--> statement-breakpoint')
    const outcome = await migrator
      .begin(async (sql) => {
        // What a project that ran no db:roles before the first migration hands out by default.
        await sql.unsafe(
          'grant execute on all functions in schema public to anon, authenticated, service_role',
        )
        const before = (await verifyDatabase(sql)).filter((line) => line.includes('executable by'))
        for (const statement of statements) await sql.unsafe(statement)
        const after = (await verifyDatabase(sql)).filter((line) => line.includes('executable by'))
        throw Object.assign(new Rollback(), { before, after })
      })
      .catch((error: unknown) => {
        if (error instanceof Rollback)
          return error as Rollback & { before: string[]; after: string[] }
        throw error
      })
    // db:verify reports the functions that kept the default, and none once the migration ran.
    expect(outcome.before.join('\n')).toMatch(/handle_auth_user_created/)
    expect(outcome.before.join('\n')).toMatch(/opos_handle_mfa_factor_change/)
    expect(outcome.after).toEqual([])
  })
})

describe('runtime privileges', () => {
  // The columns the allowed cross-tenant queries read: the list db:verify holds the role
  // to, so the grants the migrations made and that list cannot drift apart.
  const readsOf = (table: string) =>
    globalReads.filter((read) => read.startsWith(`${table}.`)).map((read) => read.split('.')[1]!)

  it.each(covered)('lets opos_app_global read only what its queries need of %s', async (table) => {
    const columns = await migrator<{ column: string }[]>`
      select a.attname as column from pg_attribute a
      where a.attrelid = ${'public.' + table}::regclass and a.attnum > 0 and not a.attisdropped
    `
    // `default values`, `= null` and a `false` condition reach the privilege check before
    // anything else, so only a missing insert, update or delete privilege can refuse them.
    for (const { column } of columns) {
      const read = global.unsafe(`select ${column} from ${table} limit 1`)
      if (readsOf(table).includes(column)) await read
      else await expect(read, column).rejects.toThrow(/permission denied/)
      await expect(
        global.unsafe(`update ${table} set ${column} = null where false`),
        `update ${column}`,
      ).rejects.toThrow(/permission denied/)
    }
    for (const statement of [
      `insert into ${table} default values`,
      `delete from ${table} where false`,
    ]) {
      await expect(global.unsafe(statement), statement).rejects.toThrow(/permission denied/)
    }
  })

  it('lets opos_app create and delete no tenant, and change no accepted invitation', async () => {
    for (const statement of [
      `insert into tenants (slug, name) values ('rls-foreign', 'Foreign')`,
      `delete from tenants where id = '${b.id}'`,
      `update accepted_invitations set jti = jti`,
      `delete from accepted_invitations`,
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('lets opos_app add a member and record an accepted invitation', async () => {
    const account = await createUser()

    await inTenant(b.id, async (sql) => {
      await sql`
        insert into tenant_memberships (account_id, tenant_id, role)
        values (${account.id}, ${b.id}, 'org')
      `
      await sql`insert into accepted_invitations (tenant_id, jti) values (${b.id}, gen_random_uuid())`
    })
  })

  // The route deletes the edition as opos_app, which holds no delete on the rows that cascade.
  it('lets opos_app delete an edition together with its programme', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)
    const item = await createProgramItem(tenant.id, edition)
    await migrator`
      insert into program_item_speakers (tenant_id, program_item_id, account_id)
      values (${tenant.id}, ${item}, ${tenant.headId})
    `
    await migrator`
      insert into program_item_likes (tenant_id, program_item_id, account_id)
      values (${tenant.id}, ${item}, ${tenant.headId})
    `

    await inTenant(tenant.id, (sql) => sql`delete from editions where id = ${edition}`)

    const [left] = await migrator<{ items: number; speakers: number; likes: number }[]>`
      select
        (select count(*)::int from program_items where id = ${item}) as items,
        (select count(*)::int from program_item_speakers where program_item_id = ${item}) as speakers,
        (select count(*)::int from program_item_likes where program_item_id = ${item}) as likes
    `
    expect(left).toEqual({ items: 0, speakers: 0, likes: 0 })
  })

  it('lets opos_app write programme items, their speakers and likes', async () => {
    const edition = await createEdition(b.id)
    const account = await createUser()

    await inTenant(b.id, async (sql) => {
      const [item] = await sql<{ id: string }[]>`
        insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
        values (${b.id}, ${edition}, 'Item', '2026-06-01 10:00Z', '2026-06-01 11:00Z')
        returning id
      `
      await sql`
        update program_items
        set title = 'Renamed', description = 'Text', starts_at = starts_at, ends_at = ends_at
        where id = ${item!.id}
      `
      await sql`
        insert into program_item_speakers (tenant_id, program_item_id, account_id)
        values (${b.id}, ${item!.id}, ${account.id})
      `
      await sql`delete from program_item_speakers where program_item_id = ${item!.id}`
      await sql`
        insert into program_item_likes (tenant_id, program_item_id, account_id)
        values (${b.id}, ${item!.id}, ${account.id})
      `
      await sql`delete from program_item_likes where program_item_id = ${item!.id}`
      await sql`delete from program_items where id = ${item!.id}`
    })
  })

  it('lets opos_app replace and remove a logo, and change none', async () => {
    await inTenant(b.id, async (sql) => {
      const [gone] = await sql<{ fileId: string }[]>`
        delete from tenant_logos returning file_id as "fileId"
      `
      await sql`insert into tenant_logos (tenant_id, file_id) values (${b.id}, ${gone!.fileId})`
    })
    for (const statement of [
      'update tenant_logos set file_id = file_id',
      'update tenant_logos set tenant_id = tenant_id',
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('lets opos_app set and clear the venue of an edition', async () => {
    const edition = await createEdition(b.id)
    await inTenant(b.id, async (sql) => {
      await sql`
        update editions set venue_name = 'Hall', venue_address = '1 Main St', venue_city = 'Poznań'
        where id = ${edition}
      `
      await sql`
        update editions set venue_name = null, venue_address = null, venue_city = null
        where id = ${edition}
      `
    })
  })

  it('lets opos_app update only the columns the API changes', async () => {
    await inTenant(b.id, (sql) => sql`update tenants set name = name where id = ${b.id}`)
    for (const statement of [
      'update tenants set slug = slug',
      'update tenant_memberships set account_id = account_id',
      'update edition_memberships set tenant_membership_id = tenant_membership_id',
      'update editions set id = id',
      'update program_items set tenant_id = tenant_id',
      'update program_items set edition_id = edition_id',
      'update program_item_speakers set account_id = account_id',
      'update program_item_likes set account_id = account_id',
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
