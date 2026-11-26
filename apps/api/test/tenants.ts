import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  createTenant,
  migrationDb,
  migrationUrl,
  restoreTenant,
  suspendTenant,
  tenants,
  type Transaction,
} from '@opos/db'
import { providerAccountOf, seal, sealingKey } from '@opos/db/sealed'
import { inArray, sql } from 'drizzle-orm'
import { loadEnv } from '../src/config/env'
import { createAccount, signIn } from './auth'

// Tenants, editions and memberships for API tests, written as postgres.

const db = migrationDb(migrationUrl())
const tenantIds: string[] = []

type Level = 'none' | 'read' | 'write'

export interface Member {
  id: string
  email: string
  token: string
}

export async function member(): Promise<Member> {
  const account = await createAccount()
  return { ...account, token: await signIn(account.email) }
}

/** A TOTP factor, written to Supabase Auth's table as postgres; the mirror trigger follows. */
export async function addVerifiedFactor(accountId: string, status = 'verified') {
  await db.execute(sql`
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values (${randomUUID()}, ${accountId}, 'Authenticator', 'totp', ${status}, now(), now(), 'JBSWY3DPEHPK3PXP')
  `)
}

/** A tenant of its own, headed by `head` or by a new account. */
export async function tenantWithHead(defaultLocale?: string, { head }: { head?: Member } = {}) {
  head ??= await member()
  const slug = `api-${randomUUID().slice(0, 8)}`
  const { id } = await createTenant(db, {
    slug,
    name: `Tenant ${slug}`,
    headEmail: head.email,
    defaultLocale,
  })
  tenantIds.push(id)
  return { id, slug, head }
}

/** Suspends the tenant, as the admin does. */
export const suspend = (tenantId: string) => suspendTenant(db, tenantId)

/** Restores a suspended tenant. */
export const restore = (tenantId: string) => restoreTenant(db, tenantId)

export async function addEdition(
  tenantId: string,
  values: {
    slug?: string
    /** Left out, the edition is named after its slug. */
    name?: string
    isPublished?: boolean
    isActive?: boolean
    startsAt?: string
    endsAt?: string
    venueCity?: string
  } = {},
) {
  const slug = values.slug ?? randomUUID().slice(0, 8)
  const rows = await db.execute<{ id: string }>(sql`
    insert into editions (tenant_id, slug, name, starts_at, ends_at, is_published, is_active, venue_city)
    values (${tenantId}, ${slug}, ${values.name ?? slug}, ${values.startsAt ?? '2027-06-01'},
      ${values.endsAt ?? '2027-06-03'}, ${values.isPublished ?? false}, ${values.isActive ?? false},
      ${values.venueCity ?? null})
    returning id
  `)
  return rows[0]!.id
}

/** Sets the venue of an edition, as its settings do. */
export const setVenue = (
  editionId: string,
  venue: { name: string; address: string; city: string },
) =>
  db.execute(sql`
    update editions
    set venue_name = ${venue.name}, venue_address = ${venue.address}, venue_city = ${venue.city}
    where id = ${editionId}
  `)

/** Publishes an edition or takes it back, as its settings do. */
export const setPublished = (editionId: string, isPublished: boolean) =>
  db.execute(sql`update editions set is_published = ${isPublished} where id = ${editionId}`)

/**
 * A logo of the tenant as its rows alone, with nothing in the bucket: for a test of what the
 * database holds or of what a list answers.
 */
export async function addLogo(tenantId: string, width = 400, height = 200) {
  const rows = await db.execute<{ id: string }>(sql`
    insert into uploaded_files (tenant_id, kind, content_type, size, sha256, name, width, height)
    values (${tenantId}, 'convention-logo', 'image/png', 10, repeat('c', 64), 'logo.png',
      ${width}, ${height})
    returning id
  `)
  await db.execute(
    sql`insert into tenant_logos (tenant_id, file_id) values (${tenantId}, ${rows[0]!.id})`,
  )
  return { fileId: rows[0]!.id, width, height }
}

/** Opens the shop of an edition, as its settings do. */
export const openShop = (tenantId: string, editionId: string) =>
  db.execute(sql`
    insert into edition_shops (tenant_id, edition_id, opened_at)
    values (${tenantId}, ${editionId}, now())
    on conflict (edition_id) do update set opened_at = now()
  `)

/** Closes the shop of an edition. */
export const closeShop = (editionId: string) =>
  db.execute(sql`update edition_shops set opened_at = null where edition_id = ${editionId}`)

/**
 * A provider account of the tenant as its row alone, with credentials nothing opens: for a test
 * of what a refused request leaves, or of a disconnection.
 */
export const addProviderAccount = (tenantId: string) =>
  db.execute(sql`
    insert into payment_provider_accounts (tenant_id, provider, credentials, ready_at)
    values (${tenantId}, 'fake', 'sealed', now())
  `)

/**
 * A provider account of the fake provider whose credentials the API opens, as connecting it
 * through the shop's settings stores them; it takes the place of the tenant's account. The
 * `account` chooses how the fake provider answers (FAKE_ACCOUNT).
 */
export const connectFake = (tenantId: string, account = 'demo') =>
  connectAccount(tenantId, 'fake', { account })

/** A provider account of the tenant with these credentials, sealed as the API seals them. */
export async function connectAccount(
  tenantId: string,
  provider: 'fake' | 'przelewy24',
  credentials: Record<string, string>,
) {
  const sealed = seal(
    sealingKey(loadEnv().PAYMENT_CREDENTIALS_KEY),
    JSON.stringify(credentials),
    providerAccountOf(tenantId, provider),
  )
  await db.execute(sql`delete from payment_provider_accounts where tenant_id = ${tenantId}`)
  await db.execute(sql`
    insert into payment_provider_accounts (tenant_id, provider, credentials, ready_at)
    values (${tenantId}, ${provider}, ${sealed}, now())
  `)
}

/** Leaves the tenant's provider account with credentials nothing opens, as a replaced key does. */
export const loseCredentials = (tenantId: string) =>
  db.execute(sql`
    update payment_provider_accounts set credentials = 'sealed' where tenant_id = ${tenantId}
  `)

/** Complete seller's details of the tenant, as its shop settings set them. */
export const addSeller = (tenantId: string) =>
  db.execute(sql`
    insert into shop_sellers
      (tenant_id, seller_name, seller_address, seller_registration_number, contact_email)
    values (${tenantId}, 'Seller Ltd', '1 Main St', '0000000000', 'shop@seller.test')
    on conflict (tenant_id) do nothing
  `)

/**
 * A legal document of an edition as its rows alone, with nothing in the bucket: the document, and
 * as many versions as asked for, each pointing at a file's row of its own.
 */
export async function addDocument(
  tenantId: string,
  editionId: string,
  kind: 'shop-terms' | 'privacy-policy' | 'edition-rules' | 'other' = 'other',
  {
    versions = 1,
    hidden = false,
    title = kind,
  }: { versions?: number; hidden?: boolean; title?: string } = {},
) {
  const [document] = await db.execute<{ id: string }>(sql`
    insert into edition_documents (tenant_id, edition_id, kind, title, hidden_at)
    values (${tenantId}, ${editionId}, ${kind}, ${title}, ${hidden ? sql`now()` : null})
    returning id
  `)
  const versionIds: string[] = []
  const fileIds: string[] = []
  for (let number = 1; number <= versions; number += 1) {
    const [file] = await db.execute<{ id: string }>(sql`
      insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
      values (${tenantId}, ${editionId}, 'edition-document', 'application/pdf', 10,
        repeat('d', 64), 'document.pdf')
      returning id
    `)
    const [version] = await db.execute<{ id: string }>(sql`
      insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
      values (${tenantId}, ${editionId}, ${document!.id}, ${number}, ${file!.id})
      returning id
    `)
    fileIds.push(file!.id)
    versionIds.push(version!.id)
  }
  return { id: document!.id, versionIds, fileIds }
}

/** Another version of a document, published after those it has; answers the version's identifier. */
export async function addDocumentVersion(tenantId: string, editionId: string, documentId: string) {
  const [file] = await db.execute<{ id: string }>(sql`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
    values (${tenantId}, ${editionId}, 'edition-document', 'application/pdf', 10,
      repeat('e', 64), 'document.pdf')
    returning id
  `)
  const [version] = await db.execute<{ id: string }>(sql`
    insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
    values (${tenantId}, ${editionId}, ${documentId}, (
      select coalesce(max(number), 0) + 1 from edition_document_versions
      where document_id = ${documentId}
    ), ${file!.id})
    returning id
  `)
  return version!.id
}

/** A consent of an edition as its row alone, last in the list unless a place is given. */
export async function addConsent(
  tenantId: string,
  editionId: string,
  values: { documentId?: string; text?: string; isRequired?: boolean; position?: number } = {},
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into edition_consents (tenant_id, edition_id, document_id, text, is_required, position)
    values (${tenantId}, ${editionId}, ${values.documentId ?? null},
      ${values.text ?? 'I accept the terms'}, ${values.isRequired ?? true},
      ${
        values.position ??
        sql`(select coalesce(max(position), 0) + 1 from edition_consents where edition_id = ${editionId})`
      })
    returning id
  `)
  return row!.id
}

/** The place after the last row of an ordered table of an edition. */
const lastPlace = (table: string, editionId: string) =>
  sql`(select coalesce(max(position), 0) + 1 from ${sql.identifier(table)} where edition_id = ${editionId})`

/** An add-on of an edition as its row alone, last in the list: free and unlimited unless told. */
export async function addAddOn(
  tenantId: string,
  editionId: string,
  values: {
    name?: string
    amountMinor?: number
    kind?: 'unlimited' | 'limited' | 'headcount'
    capacity?: number
    placesLeftThreshold?: number
    hidden?: boolean
  } = {},
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into add_ons
      (tenant_id, edition_id, name, amount_minor, kind, capacity, places_left_threshold, position,
        hidden_at)
    values (${tenantId}, ${editionId}, ${values.name ?? 'Add-on'}, ${values.amountMinor ?? 0},
      ${values.kind ?? 'unlimited'}, ${values.capacity ?? null},
      ${values.placesLeftThreshold ?? null}, ${lastPlace('add_ons', editionId)},
      ${values.hidden ? sql`now()` : null})
    returning id
  `)
  return row!.id
}

/** The row of an image of an edition, with nothing in the bucket. */
async function addImage(tenantId: string, editionId: string, kind: string) {
  const [file] = await db.execute<{ id: string }>(sql`
    insert into uploaded_files
      (tenant_id, edition_id, kind, content_type, size, sha256, name, width, height)
    values (${tenantId}, ${editionId}, ${kind}, 'image/png', 10, repeat('e', 64), 'image.png',
      40, 30)
    returning id
  `)
  return file!.id
}

/** A picture of an add-on as its rows alone: the file's row, and the row that points at it. */
export async function addAddOnPicture(tenantId: string, editionId: string, addOnId: string) {
  const fileId = await addImage(tenantId, editionId, 'add-on-picture')
  await db.execute(sql`
    insert into add_on_pictures (tenant_id, edition_id, add_on_id, file_id)
    values (${tenantId}, ${editionId}, ${addOnId}, ${fileId})
  `)
  return fileId
}

/**
 * A merchandise item of an edition as its rows alone, last in the list, with nothing in the
 * bucket. Without axes it has its one variant; `sized` gives it an axis with one value, the
 * variant of that value and the value's size chart. `pictures` adds as many pictures.
 */
export async function addMerchandiseItem(
  tenantId: string,
  editionId: string,
  values: {
    name?: string
    hidden?: boolean
    sized?: boolean
    pictures?: number
    stock?: number | null
  } = {},
) {
  const at = sql`${tenantId}, ${editionId}`
  const [item] = await db.execute<{ id: string }>(sql`
    insert into merchandise_items
      (tenant_id, edition_id, name, amount_minor, per_order_limit, position, hidden_at)
    values (${at}, ${values.name ?? 'Item'}, 5000, 5, ${lastPlace('merchandise_items', editionId)},
      ${values.hidden ? sql`now()` : null})
    returning id
  `)
  const id = item!.id
  const [variant] = await db.execute<{ id: string }>(sql`
    insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
    values (${at}, ${id}, ${values.stock === undefined ? 0 : values.stock})
    returning id
  `)
  let valueId: string | undefined
  let chartFileId: string | undefined
  if (values.sized) {
    const [axis] = await db.execute<{ id: string }>(sql`
      insert into merchandise_option_axes (tenant_id, edition_id, merchandise_item_id, name, position)
      values (${at}, ${id}, 'Size', 1)
      returning id
    `)
    const [value] = await db.execute<{ id: string }>(sql`
      insert into merchandise_option_values
        (tenant_id, edition_id, merchandise_item_id, axis_id, label, position)
      values (${at}, ${id}, ${axis!.id}, 'M', 1)
      returning id
    `)
    valueId = value!.id
    await db.execute(sql`
      insert into merchandise_variant_values
        (tenant_id, edition_id, merchandise_item_id, variant_id, axis_id, option_value_id)
      values (${at}, ${id}, ${variant!.id}, ${axis!.id}, ${valueId})
    `)
    chartFileId = await addImage(tenantId, editionId, 'merchandise-size-chart')
    await db.execute(sql`
      insert into merchandise_size_charts (tenant_id, edition_id, option_value_id, file_id)
      values (${at}, ${valueId}, ${chartFileId})
    `)
  }
  const pictureIds: string[] = []
  const pictureFileIds: string[] = []
  for (let place = 1; place <= (values.pictures ?? 0); place += 1) {
    const fileId = await addImage(tenantId, editionId, 'merchandise-picture')
    const [picture] = await db.execute<{ id: string }>(sql`
      insert into merchandise_item_pictures
        (tenant_id, edition_id, merchandise_item_id, file_id, position)
      values (${at}, ${id}, ${fileId}, ${place})
      returning id
    `)
    pictureIds.push(picture!.id)
    pictureFileIds.push(fileId)
  }
  return { id, variantId: variant!.id, valueId, chartFileId, pictureIds, pictureFileIds }
}

/**
 * A ticket type of an edition as its rows alone, last in the list: on sale from 2020 until 2099,
 * for every age band, with one tier of 100.00 over its whole sale window unless told otherwise.
 */
export async function addTicketType(
  tenantId: string,
  editionId: string,
  values: {
    name?: string
    capacity?: number
    /** The price of its one tier; null for no tier at all. */
    amountMinor?: number | null
    hidden?: boolean
    saleStartsAt?: string
    saleEndsAt?: string
    shownOutsideSaleWindow?: boolean
    discountsExcluded?: boolean
    ageBands?: ('child' | 'teen' | 'adult')[]
    /** Its tiers, in place of the one over its whole sale window. */
    tiers?: { amountMinor: number; startsAt: string; endsAt: string }[]
    supporterPrices?: number[]
    perks?: string[]
  } = {},
) {
  const saleStartsAt = values.saleStartsAt ?? '2020-01-01T00:00:00Z'
  const saleEndsAt = values.saleEndsAt ?? '2099-01-01T00:00:00Z'
  const bands = values.ageBands ?? ['child', 'teen', 'adult']
  const [row] = await db.execute<{ id: string }>(sql`
    insert into ticket_types
      (tenant_id, edition_id, name, capacity, sale_starts_at, sale_ends_at, allows_child,
        allows_teen, allows_adult, discounts_excluded, shown_outside_sale_window, position,
        hidden_at)
    values (${tenantId}, ${editionId}, ${values.name ?? 'Ticket type'}, ${values.capacity ?? null},
      ${saleStartsAt}, ${saleEndsAt}, ${bands.includes('child')}, ${bands.includes('teen')},
      ${bands.includes('adult')}, ${values.discountsExcluded ?? false},
      ${values.shownOutsideSaleWindow ?? false}, ${lastPlace('ticket_types', editionId)},
      ${values.hidden ? sql`now()` : null})
    returning id
  `)
  const tiers =
    values.tiers ??
    (values.amountMinor === null
      ? []
      : [{ amountMinor: values.amountMinor ?? 10000, startsAt: saleStartsAt, endsAt: saleEndsAt }])
  for (const tier of tiers) {
    await db.execute(sql`
      insert into ticket_type_price_tiers
        (tenant_id, edition_id, ticket_type_id, amount_minor, starts_at, ends_at)
      values (${tenantId}, ${editionId}, ${row!.id}, ${tier.amountMinor}, ${tier.startsAt},
        ${tier.endsAt})
    `)
  }
  for (const amount of values.supporterPrices ?? []) {
    await db.execute(sql`
      insert into ticket_type_supporter_prices (tenant_id, edition_id, ticket_type_id, amount_minor)
      values (${tenantId}, ${editionId}, ${row!.id}, ${amount})
    `)
  }
  for (const [index, perk] of (values.perks ?? []).entries()) {
    await db.execute(sql`
      insert into ticket_type_perks (tenant_id, edition_id, ticket_type_id, name, position)
      values (${tenantId}, ${editionId}, ${row!.id}, ${perk}, ${index + 1})
    `)
  }
  return row!.id
}

/** What a ticket type offers: the add-ons and the merchandise items taken with it. */
export async function offerWith(
  tenantId: string,
  editionId: string,
  ticketTypeId: string,
  offered: { addOnIds?: string[]; itemIds?: string[] },
) {
  for (const addOnId of offered.addOnIds ?? []) {
    await db.execute(sql`
      insert into ticket_type_add_ons (tenant_id, edition_id, ticket_type_id, add_on_id)
      values (${tenantId}, ${editionId}, ${ticketTypeId}, ${addOnId})
    `)
  }
  for (const itemId of offered.itemIds ?? []) {
    await db.execute(sql`
      insert into ticket_type_merchandise_items
        (tenant_id, edition_id, ticket_type_id, merchandise_item_id)
      values (${tenantId}, ${editionId}, ${ticketTypeId}, ${itemId})
    `)
  }
}

/** The settings an edition gives its catalog, on the row of its shop; the row is made if need be. */
export async function setCatalogSettings(
  tenantId: string,
  editionId: string,
  values: {
    merchPreorderDeadline?: string | null
    merchOnlyEnabled?: boolean
    salesClosedMessage?: string | null
    faqUrl?: string | null
    teenFromAge?: number
    adultFromAge?: number
    guardianConsentFormUrl?: string
    pickupInformation?: string
    reminderDaysBefore?: number
  },
) {
  await db.execute(sql`
    insert into edition_shops (tenant_id, edition_id) values (${tenantId}, ${editionId})
    on conflict (edition_id) do nothing
  `)
  await db.execute(sql`
    update edition_shops set
      merch_preorder_deadline = ${values.merchPreorderDeadline ?? null},
      merch_only_enabled = ${values.merchOnlyEnabled ?? false},
      sales_closed_message = ${values.salesClosedMessage ?? null},
      faq_url = ${values.faqUrl ?? null},
      teen_from_age = ${values.teenFromAge ?? null},
      adult_from_age = ${values.adultFromAge ?? null},
      guardian_consent_form_url = ${values.guardianConsentFormUrl ?? null},
      pickup_information = ${values.pickupInformation ?? null},
      reminder_days_before = ${values.reminderDaysBefore ?? null}
    where edition_id = ${editionId}
  `)
}

/** Sets one column of one row, as postgres: for a state no helper above makes. */
export const setColumn = (table: string, id: string, column: string, value: unknown) =>
  db.execute(sql`
    update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where id = ${id}
  `)

/** The characters of an order's number: none that is mistaken for another. */
const ORDER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * An order as its rows alone, with the lines given: awaiting payment and holding what it took
 * unless told otherwise. For a test of what orders hold of a limit.
 */
export async function addOrder(
  tenantId: string,
  editionId: string,
  values: {
    status?: string
    holds?: boolean
    /** Null for a manual order, which nobody placed in the shop. */
    email?: string | null
    holderName?: string
    /** Null for an order with no ticket. */
    ageBand?: 'child' | 'teen' | 'adult' | null
    placedAt?: string
    totalMinor?: number
    manualReason?: 'desk' | 'invoice' | 'complimentary'
    reviewCause?: 'amount' | 'unavailable'
    ticketTypeId?: string
    addOnIds?: string[]
    variants?: { itemId: string; variantId: string; quantity: number }[]
    holdEndsAt?: string
  } = {},
) {
  const number = Array.from(
    randomUUID().replace(/-/g, '').slice(0, 10),
    (digit) => ORDER_ALPHABET[parseInt(digit, 16)]!,
  ).join('')
  const [order] = await db.execute<{ id: string }>(sql`
    insert into orders (tenant_id, edition_id, number, status, email, holder_name, age_band,
      total_minor, holds, hold_ends_at, result_token_hash, placed_at, manual_reason, review_cause)
    values (${tenantId}, ${editionId}, ${number}, ${values.status ?? 'awaiting-payment'},
      ${values.email === undefined ? 'buyer@example.test' : values.email},
      ${values.holderName ?? 'Ada'}, ${values.ageBand === undefined ? 'adult' : values.ageBand},
      ${values.totalMinor ?? 10000},
      ${values.holds ?? true}, ${values.holdEndsAt ?? '2099-01-01T00:00:00Z'}, repeat('0', 64),
      ${values.placedAt ?? sql`now()`}, ${values.manualReason ?? null},
      ${values.reviewCause ?? null})
    returning id
  `)
  const at = sql`${tenantId}, ${editionId}, ${order!.id}`
  if (values.ticketTypeId) {
    await db.execute(sql`
      insert into order_lines (tenant_id, edition_id, order_id, kind, ticket_type_id, quantity,
        unit_amount_minor, amount_minor)
      values (${at}, 'ticket', ${values.ticketTypeId}, 1, 10000, 10000)
    `)
  }
  for (const addOnId of values.addOnIds ?? []) {
    await db.execute(sql`
      insert into order_lines (tenant_id, edition_id, order_id, kind, add_on_id, quantity,
        unit_amount_minor, amount_minor)
      values (${at}, 'add_on', ${addOnId}, 1, 0, 0)
    `)
  }
  for (const variant of values.variants ?? []) {
    await db.execute(sql`
      insert into order_lines (tenant_id, edition_id, order_id, kind, merchandise_item_id,
        merchandise_variant_id, quantity, unit_amount_minor, amount_minor)
      values (${at}, 'merchandise', ${variant.itemId}, ${variant.variantId}, ${variant.quantity},
        5000, ${variant.quantity * 5000})
    `)
  }
  return { id: order!.id, number }
}

/**
 * A scanner of an edition as its row alone, paired already: the phone holds `token`, of which
 * the row keeps the hash. Enabled by the tenant's first head unless a membership is given.
 */
export async function addScanner(
  tenantId: string,
  editionId: string,
  values: {
    name?: string
    membershipId?: string | null
    /** Null for a scanner whose org set no end: it follows its edition. Left out, a far end. */
    expiresAt?: string | null
    revoked?: boolean
    /** Not paired yet: no token, and a pairing code still to spend. */
    pairingCode?: string
    pairingExpiresAt?: string
  } = {},
) {
  const token = randomBytes(32).toString('base64url')
  const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex')
  const paired = values.pairingCode === undefined
  const [row] = await db.execute<{ id: string }>(sql`
    insert into scanner_devices (tenant_id, edition_id, name, enabled_by_membership_id,
      pairing_code_hash, pairing_expires_at, paired_at, token_hash, expires_at, revoked_at)
    values (${tenantId}, ${editionId}, ${values.name ?? `Gate ${randomUUID().slice(0, 8)}`},
      ${
        values.membershipId === undefined
          ? sql`(select id from tenant_memberships where tenant_id = ${tenantId}
              and role = 'head' order by created_at limit 1)`
          : values.membershipId
      },
      ${hashOf(values.pairingCode ?? randomUUID())},
      ${values.pairingExpiresAt ?? sql`now() + interval '15 minutes'`},
      ${paired ? sql`now()` : null}, ${paired ? hashOf(token) : null},
      ${values.expiresAt === undefined ? '2099-01-01T00:00:00Z' : values.expiresAt},
      ${values.revoked ? sql`now()` : null})
    returning id
  `)
  return { id: row!.id, token }
}

/** A QR code's text no other test holds: a code is found by its hash, which no two share. */
export const aQrCode = () =>
  Array.from(randomBytes(32), (byte) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[byte % 32]).join('')

/**
 * The QR code an order carries, as its rows alone: stored by its hash, with nothing sealed. A
 * code given as replaced is one the order had before, and carries no longer.
 */
export async function addQrCode(
  tenantId: string,
  editionId: string,
  orderId: string,
  code: string,
  replaced = false,
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into order_qr_codes (tenant_id, edition_id, code_hash, code, replaced_at)
    values (${tenantId}, ${editionId}, ${createHash('sha256').update(code).digest('hex')},
      'sealed', ${replaced ? sql`now()` : null})
    returning id
  `)
  if (!replaced) {
    await db.execute(sql`
      insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
      values (${tenantId}, ${editionId}, ${orderId}, ${row!.id})
    `)
  }
  return row!.id
}

/** Puts an order on a QR code another order carries, as a "Buy more" order is. */
export async function carryQrCode(
  tenantId: string,
  editionId: string,
  orderId: string,
  qrCodeId: string,
) {
  await db.execute(sql`
    insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
    values (${tenantId}, ${editionId}, ${orderId}, ${qrCodeId})
  `)
}

/**
 * A discount code of an edition as its rows alone: ten percent, valid from 2020 until 2099 and
 * with no limit unless told, applying to what is named.
 */
export async function addDiscountCode(
  tenantId: string,
  editionId: string,
  values: {
    code?: string
    percent?: number
    /** An amount code instead of a percent one. */
    amountMinor?: number
    usageLimit?: number
    validFrom?: string
    validUntil?: string
    ended?: boolean
    ticketTypeIds?: string[]
    addOnIds?: string[]
    itemIds?: string[]
  } = {},
) {
  const code = values.code ?? `code-${randomUUID().slice(0, 8)}`
  const amount = values.amountMinor !== undefined
  const [row] = await db.execute<{ id: string }>(sql`
    insert into discount_codes (tenant_id, edition_id, code, kind, percent, amount_minor,
      usage_limit, valid_from, valid_until, ended_at)
    values (${tenantId}, ${editionId}, ${code}, ${amount ? 'amount' : 'percent'},
      ${amount ? null : (values.percent ?? 10)}, ${values.amountMinor ?? null},
      ${values.usageLimit ?? null}, ${values.validFrom ?? '2020-01-01T00:00:00Z'},
      ${values.validUntil ?? '2099-01-01T00:00:00Z'}, ${values.ended ? sql`now()` : null})
    returning id
  `)
  const at = sql`${tenantId}, ${editionId}, ${row!.id}`
  for (const id of values.ticketTypeIds ?? []) {
    await db.execute(sql`
      insert into discount_code_ticket_types (tenant_id, edition_id, discount_code_id, ticket_type_id)
      values (${at}, ${id})
    `)
  }
  for (const id of values.addOnIds ?? []) {
    await db.execute(sql`
      insert into discount_code_add_ons (tenant_id, edition_id, discount_code_id, add_on_id)
      values (${at}, ${id})
    `)
  }
  for (const id of values.itemIds ?? []) {
    await db.execute(sql`
      insert into discount_code_merchandise_items
        (tenant_id, edition_id, discount_code_id, merchandise_item_id)
      values (${at}, ${id})
    `)
  }
  return { id: row!.id, code }
}

/** One more variant of a merchandise item, as its row alone. */
export async function addVariant(
  tenantId: string,
  editionId: string,
  itemId: string,
  stock: number | null,
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
    values (${tenantId}, ${editionId}, ${itemId}, ${stock})
    returning id
  `)
  return row!.id
}

/** An order link as its row alone, of a token nobody holds: one sent with an earlier email. */
export async function addOrderLink(tenantId: string, editionId: string, orderId: string) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at)
    values (${tenantId}, ${editionId}, ${orderId},
      ${createHash('sha256').update(randomUUID()).digest('hex')}, now() + interval '30 days')
    returning id
  `)
  return row!.id
}

/**
 * An order link under a token the test holds, as its row alone: one that opens, one that expired
 * a day ago, or one that a changed email ended.
 */
export async function addOrderLinkWithToken(
  tenantId: string,
  editionId: string,
  orderId: string,
  state: 'valid' | 'expired' | 'ended' = 'valid',
) {
  const token = randomBytes(32).toString('base64url')
  await db.execute(sql`
    insert into order_links (tenant_id, edition_id, order_id, token_hash, expires_at, ended_at)
    values (${tenantId}, ${editionId}, ${orderId},
      ${createHash('sha256').update(token).digest('hex')},
      now() + ${state === 'expired' ? sql`interval '-1 day'` : sql`interval '30 days'`},
      ${state === 'ended' ? sql`now()` : null})
  `)
  return token
}

/** What a ticket holder answered to a custom field of the edition, as its row alone. */
export const addOrderAnswer = (
  tenantId: string,
  editionId: string,
  orderId: string,
  customFieldId: string,
  answer: string,
) =>
  db.execute(sql`
    insert into order_custom_field_answers (tenant_id, edition_id, order_id, custom_field_id, answer)
    values (${tenantId}, ${editionId}, ${orderId}, ${customFieldId}, ${answer})
  `)

/** A payment attempt of an order as its row alone: paid at the fake provider unless said otherwise. */
export async function addPaymentAttempt(
  tenantId: string,
  editionId: string,
  orderId: string,
  values: {
    status?: 'started' | 'paid' | 'failed' | 'ended' | 'refused'
    amountMinor?: number
    paidAmountMinor?: number | null
    paidAt?: string | null
    moneyWith?: 'convention' | 'buyer' | null
    providerReference?: string | null
    information?: Record<string, string> | null
    /** When it was marked as one nobody asks about again. */
    recheckedAt?: string | null
  } = {},
) {
  const status = values.status ?? 'paid'
  const settled = status === 'paid' || status === 'refused'
  const paidAt =
    values.paidAt === undefined ? (settled ? '2027-05-01T10:05:00Z' : null) : values.paidAt
  const [row] = await db.execute<{ id: string }>(sql`
    insert into payment_attempts (tenant_id, edition_id, order_id, provider, status, amount_minor,
      paid_amount_minor, paid_at, confirmed_at, money_with, provider_reference, rechecked_at,
      information)
    values (${tenantId}, ${editionId}, ${orderId}, 'fake', ${status}, ${values.amountMinor ?? 10000},
      ${values.paidAmountMinor === undefined ? (settled ? (values.amountMinor ?? 10000) : null) : values.paidAmountMinor},
      ${paidAt}, ${paidAt},
      ${values.moneyWith === undefined ? (status === 'paid' ? 'convention' : status === 'refused' ? 'buyer' : null) : values.moneyWith},
      ${values.providerReference ?? null}, ${values.recheckedAt ?? null},
      ${values.information === undefined || values.information === null ? null : sql`${JSON.stringify(values.information)}::jsonb`})
    returning id
  `)
  return row!.id
}

/**
 * The moment a test runs a job at: now, a few milliseconds on. The database keeps a moment to
 * the microsecond and a `Date` to the millisecond, so a row made due "now" in this very
 * millisecond is later than a `Date` taken right after it, and a job run at that `Date` would
 * pass it by as not due yet.
 */
export const jobTime = () => new Date(Date.now() + 5)

/** An email of an order as its row alone, due at once: what a route queues for the outbox. */
export const queueOrderEmail = (
  tenantId: string,
  editionId: string,
  orderId: string,
  kind: string,
  recipient: string,
) =>
  db.execute(sql`
    insert into order_emails (tenant_id, edition_id, order_id, kind, recipient)
    values (${tenantId}, ${editionId}, ${orderId}, ${kind}, ${recipient})
  `)

/**
 * An email of an order as its row alone, in the state given: queued a while ago, sent with what
 * it said, withdrawn or failed. For a test of what an org reads of the emails.
 */
export async function addOrderEmail(
  tenantId: string,
  editionId: string,
  orderId: string,
  values: {
    kind?: string
    recipient?: string
    queuedAt?: string
    sentAt?: string | null
    withdrawnAt?: string | null
    failedAttempts?: number
    subject?: string | null
    body?: string | null
  } = {},
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into order_emails (tenant_id, edition_id, order_id, kind, recipient, queued_at, sent_at,
      withdrawn_at, failed_attempts, subject, body)
    values (${tenantId}, ${editionId}, ${orderId}, ${values.kind ?? 'order-confirmation'},
      ${values.recipient ?? 'buyer@example.test'}, ${values.queuedAt ?? new Date().toISOString()},
      ${values.sentAt ?? null}, ${values.withdrawnAt ?? null}, ${values.failedAttempts ?? 0},
      ${values.subject ?? null}, ${values.body ?? null})
    returning id
  `)
  return row!.id
}

/** A custom field of an edition as its row alone, last in the list. */
export async function addCustomField(
  tenantId: string,
  editionId: string,
  values: { label?: string; isRequired?: boolean; hidden?: boolean } = {},
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into edition_custom_fields (tenant_id, edition_id, label, is_required, position, hidden_at)
    values (${tenantId}, ${editionId}, ${values.label ?? 'Field'}, ${values.isRequired ?? false},
      ${lastPlace('edition_custom_fields', editionId)}, ${values.hidden ? sql`now()` : null})
    returning id
  `)
  return row!.id
}

/** What orders the rows of a table that has no moment of its own making. */
const ROW_ORDER: Record<string, string> = {
  edition_shops: 'edition_id',
  uploaded_files: 'created_at, id',
  merchandise_option_axes: 'merchandise_item_id, position',
  merchandise_option_values: 'axis_id, position',
  merchandise_item_pictures: 'merchandise_item_id, position',
  merchandise_size_charts: 'option_value_id',
  merchandise_variant_values: 'variant_id, axis_id',
  order_custom_field_answers: 'order_id, custom_field_id',
  order_consents: 'order_id, consent_id',
  order_qr_code_orders: 'order_id',
  order_accounts: 'order_id',
  payment_provider_accounts: 'tenant_id',
  order_emails: 'queued_at, id',
  ticket_type_price_tiers: 'ticket_type_id, starts_at',
  ticket_type_supporter_prices: 'ticket_type_id, amount_minor',
  ticket_type_perks: 'ticket_type_id, position',
  ticket_type_add_ons: 'ticket_type_id, add_on_id',
  ticket_type_merchandise_items: 'ticket_type_id, merchandise_item_id',
}

/** The rows a table holds of the tenant, as stored, in the order they were added. */
export const storedRows = async (table: string, tenantId: string) => [
  ...(await db.execute<Record<string, unknown>>(sql`
    select * from ${sql.identifier(table)} where tenant_id = ${tenantId}
    order by ${sql.raw(ROW_ORDER[table] ?? 'created_at, id')}
  `)),
]

/**
 * Everything opening the shop of the edition asks for: a ready provider account, complete
 * seller's details, and the shop terms and the privacy policy with a version each.
 */
export async function makeShopReady(tenantId: string, editionId: string) {
  await addProviderAccount(tenantId)
  await addSeller(tenantId)
  const terms = await addDocument(tenantId, editionId, 'shop-terms')
  const privacy = await addDocument(tenantId, editionId, 'privacy-policy')
  return { terms, privacy }
}

/** The shop of the edition, as stored; undefined while nothing was set for it. */
export const storedShop = async (editionId: string) =>
  (
    await db.execute<{ openedAt: string | null; faqUrl: string | null }>(sql`
      select opened_at as "openedAt", faq_url as "faqUrl"
      from edition_shops where edition_id = ${editionId}
    `)
  )[0]

/** The rows a kind of file has in the tenant, as stored. */
export const storedFiles = async (tenantId: string, kind: string) => [
  ...(await db.execute<{ id: string; editionId: string | null }>(sql`
      select id, edition_id as "editionId" from uploaded_files
      where tenant_id = ${tenantId} and kind = ${kind} order by id
    `)),
]

/** The file of a size chart the seed gave a demo convention's item; a test only reads it. */
export const seededSizeChart = async (slug: string) =>
  (
    await db.execute<{ id: string }>(sql`
      select c.file_id as id from merchandise_size_charts c
      join tenants t on t.id = c.tenant_id
      where t.slug = ${slug} order by c.file_id limit 1
    `)
  )[0]?.id

/** A version of a legal document the seed published for a demo convention; a test only reads it. */
export const seededDocumentVersion = async (slug: string) =>
  (
    await db.execute<{ id: string }>(sql`
      select v.id from edition_document_versions v
      join tenants t on t.id = v.tenant_id
      where t.slug = ${slug} order by v.id limit 1
    `)
  )[0]?.id

/** Moves a tenant's provider account to another tenant, as only a hand in the database can. */
export const moveProviderAccount = (from: string, to: string) =>
  db.execute(sql`update payment_provider_accounts set tenant_id = ${to} where tenant_id = ${from}`)

/** The provider account of the tenant, as stored. */
export const storedProviderAccount = async (tenantId: string) =>
  (
    await db.execute<{ provider: string; credentials: string; readyAt: string | null }>(sql`
      select provider, credentials, ready_at as "readyAt"
      from payment_provider_accounts where tenant_id = ${tenantId}
    `)
  )[0]

/** The file the tenant's logo points at, as stored. */
export const logoOf = async (tenantId: string) =>
  (
    await db.execute<{ fileId: string }>(
      sql`select file_id as "fileId" from tenant_logos where tenant_id = ${tenantId}`,
    )
  )[0]?.fileId

export async function addProgramItem(
  tenantId: string,
  editionId: string,
  values: { title?: string; startsAt?: string; endsAt?: string } = {},
) {
  const rows = await db.execute<{ id: string }>(sql`
    insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
    values (${tenantId}, ${editionId}, ${values.title ?? 'Item'},
      ${values.startsAt ?? '2027-06-01 09:00Z'}, ${values.endsAt ?? '2027-06-01 10:00Z'})
    returning id
  `)
  return rows[0]!.id
}

/** `count` programme items at once, for a test that needs an edition full of them. */
export async function addProgramItems(tenantId: string, editionId: string, count: number) {
  await db.execute(sql`
    insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
    select ${tenantId}, ${editionId}, 'Item ' || n, '2027-06-01 09:00Z', '2027-06-01 10:00Z'
    from generate_series(1, ${count}::int) as n
  `)
}

/** How many likes an item holds, as stored. */
export const countLikes = async (itemId: string) =>
  (
    await db.execute<{ count: number }>(
      sql`select count(*)::int as count from program_item_likes where program_item_id = ${itemId}`,
    )
  )[0]!.count

export async function addSpeaker(tenantId: string, itemId: string, accountId: string) {
  await db.execute(sql`
    insert into program_item_speakers (tenant_id, program_item_id, account_id)
    values (${tenantId}, ${itemId}, ${accountId})
  `)
}

export async function addLike(tenantId: string, itemId: string, accountId: string) {
  await db.execute(sql`
    insert into program_item_likes (tenant_id, program_item_id, account_id)
    values (${tenantId}, ${itemId}, ${accountId})
  `)
}

export async function addOrg(
  tenantId: string,
  account: { id: string },
  access: {
    settings?: Level
    branding?: Level
    shop?: Level
    expired?: boolean
    expiresAt?: Date
  } = {},
) {
  const expiresAt = access.expired
    ? sql`now() - interval '1 day'`
    : access.expiresAt
      ? sql`${access.expiresAt.toISOString()}::timestamptz`
      : null
  const rows = await db.execute<{ id: string }>(sql`
    insert into tenant_memberships
      (account_id, tenant_id, role, settings_access, branding_access, shop_config_access, expires_at)
    values (${account.id}, ${tenantId}, 'org', ${access.settings ?? 'none'},
      ${access.branding ?? 'none'}, ${access.shop ?? 'none'}, ${expiresAt})
    returning id
  `)
  return rows[0]!.id
}

export async function addEditionAccess(
  tenantId: string,
  membershipId: string,
  editionId: string,
  access: { program?: Level; websiteContent?: Level; tickets?: Level },
) {
  await db.execute(sql`
    insert into edition_memberships
      (tenant_id, tenant_membership_id, edition_id, program_access, website_content_access, tickets_access)
    values (${tenantId}, ${membershipId}, ${editionId}, ${access.program ?? 'none'},
      ${access.websiteContent ?? 'none'}, ${access.tickets ?? 'none'})
  `)
}

export const countEditions = async (tenantId: string, slug: string) =>
  (
    await db.execute<{ count: number }>(
      sql`select count(*)::int as count from editions where tenant_id = ${tenantId} and slug = ${slug}`,
    )
  )[0]!.count

/** Tenants go first: a tenant's last head cannot be deleted while the tenant exists. */
export async function deleteCreatedTenants() {
  if (tenantIds.length > 0) {
    // An order keeps its edition, and so its tenant: the orders of a test's tenants go first.
    await db.execute(sql`delete from orders where tenant_id in ${tenantIds}`)
    await db.delete(tenants).where(inArray(tenants.id, tenantIds))
  }
  tenantIds.length = 0
}

/** Whether accounts holds the email confirmation Supabase Auth recorded. */
export const emailConfirmed = async (accountId: string) =>
  (
    await db.execute<{ confirmed: boolean }>(
      sql`select email_confirmed_at is not null as confirmed from accounts where id = ${accountId}`,
    )
  )[0]?.confirmed

/** The account row an address has, the unconfirmed ones included. */
export const accountByEmail = async (email: string) =>
  (
    await db.execute<{
      id: string
      firstName: string | null
      lastName: string | null
      locale: string | null
    }>(
      sql`select id, first_name as "firstName", last_name as "lastName", locale from accounts where email = ${email}`,
    )
  )[0]

/** The recovery codes of an account as postgres sees them: the hash and whether it is spent. */
export async function recoveryCodeRows(accountId: string) {
  return db.execute<{ code_hash: string; used_at: Date | null }>(sql`
    select code_hash, used_at from account_recovery_codes where account_id = ${accountId}
    order by code_hash
  `)
}

/** An unused recovery code row, as a failed marking would have left it. */
export async function addRecoveryCodeHash(accountId: string, codeHash: string) {
  await db.execute(sql`
    insert into account_recovery_codes (account_id, code_hash) values (${accountId}, ${codeHash})
  `)
}

/** What the database holds of an account's two-factor authentication. */
export async function mfaState(accountId: string) {
  const [row] = await db.execute<{ mirrored: boolean; factors: number }>(sql`
    select
      (select mfa_enabled_at is not null from accounts where id = ${accountId}) as mirrored,
      (select count(*)::int from auth.mfa_factors where user_id = ${accountId}) as factors
  `)
  return { mirrored: row!.mirrored, factors: row!.factors }
}

/** An account that chose no language: the sign-up's stays in the user's metadata alone. */
export const clearAccountLocale = (accountId: string) =>
  db.execute(sql`update accounts set locale = null where id = ${accountId}`)

export const closeTenantDb = () => db.$client.end()

/**
 * Runs `statement` in a transaction of its own and keeps it open, holding the locks it took,
 * until `commit` is called: lets a test interleave a request with a concurrent write.
 */
export async function holdOpen(
  statement: (sql: Awaited<ReturnType<typeof db.$client.reserve>>) => Promise<unknown>,
) {
  const sql = await db.$client.reserve()
  await sql`begin`
  await statement(sql)
  return async () => {
    await sql`commit`
    sql.release()
  }
}

/**
 * Runs `fn` in a transaction as postgres, which bypasses RLS, with `app.tenant_id` set to
 * `tenantId`: what a repository returns there comes from its own filters alone.
 */
export const withoutRls = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    return fn(tx)
  })

/** A transaction on a connection of its own that a test drives statement by statement. */
export async function openTransaction() {
  const sql = await db.$client.reserve()
  await sql`begin`
  const end = async (statement: 'commit' | 'rollback') => {
    await sql.unsafe(statement)
    sql.release()
  }
  return { sql, commit: () => end('commit'), rollback: () => end('rollback') }
}

/**
 * Everything a tenant route can write in one tenant, as stored: the tenant, its logo, its
 * editions with their shops, documents and consents, its memberships on both levels, its
 * programme items and their speakers. Equal snapshots before and after a refused request mean it
 * changed nothing.
 */
/** The tables of the catalog, each with what orders its rows. */
const CATALOG_TABLES = [
  ['add_ons', 'id'],
  ['edition_custom_fields', 'id'],
  ['merchandise_items', 'id'],
  ['merchandise_option_axes', 'id'],
  ['merchandise_option_values', 'id'],
  ['merchandise_variants', 'id'],
  ['merchandise_variant_values', 'variant_id, axis_id'],
  ['merchandise_item_pictures', 'id'],
  ['merchandise_size_charts', 'option_value_id'],
  ['ticket_types', 'id'],
  ['ticket_type_price_tiers', 'id'],
  ['ticket_type_supporter_prices', 'id'],
  ['ticket_type_perks', 'id'],
  ['ticket_type_add_ons', 'ticket_type_id, add_on_id'],
  ['ticket_type_merchandise_items', 'ticket_type_id, merchandise_item_id'],
] as const

/** A row as a refused write must leave it: what the trigger of its last change wrote aside. */
const withoutUpdatedAt = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([column]) => column !== 'updated_at'))

export async function tenantState(tenantId: string) {
  const [tenant] = await db.execute(
    sql`select name, default_locale, timezone from tenants where id = ${tenantId}`,
  )
  const editions = await db.execute(sql`
    select id, slug, name, starts_at, ends_at, is_active, is_published,
      venue_name, venue_address, venue_city
    from editions where tenant_id = ${tenantId} order by id
  `)
  const logos = await db.execute(
    sql`select file_id from tenant_logos where tenant_id = ${tenantId}`,
  )
  const sellers = await db.execute(sql`
    select seller_name, seller_address, seller_registration_number, contact_email
    from shop_sellers where tenant_id = ${tenantId}
  `)
  const providerAccounts = await db.execute(sql`
    select provider, credentials, ready_at, created_at
    from payment_provider_accounts where tenant_id = ${tenantId}
  `)
  const files = await db.execute(
    sql`select id, kind from uploaded_files where tenant_id = ${tenantId} order by id`,
  )
  const shops = await db.execute(sql`
    select edition_id, opened_at, faq_url, teen_from_age, adult_from_age,
      guardian_consent_form_url, merch_preorder_deadline, merch_only_enabled, sales_closed_message
    from edition_shops
    where tenant_id = ${tenantId} order by edition_id
  `)
  const catalog: Record<string, unknown[]> = {}
  for (const [table, order] of CATALOG_TABLES) {
    catalog[table] = [
      ...(await db.execute(sql`
        select * from ${sql.identifier(table)} where tenant_id = ${tenantId}
        order by ${sql.raw(order)}
      `)),
    ].map(withoutUpdatedAt)
  }
  const documents = await db.execute(sql`
    select id, edition_id, kind, title, hidden_at from edition_documents
    where tenant_id = ${tenantId} order by id
  `)
  const documentVersions = await db.execute(sql`
    select id, document_id, number, file_id from edition_document_versions
    where tenant_id = ${tenantId} order by id
  `)
  const consents = await db.execute(sql`
    select id, edition_id, document_id, text, is_required, position, hidden_at
    from edition_consents where tenant_id = ${tenantId} order by id
  `)
  const memberships = await db.execute(sql`
    select id, account_id, role, settings_access, branding_access, shop_config_access, expires_at
    from tenant_memberships where tenant_id = ${tenantId} order by id
  `)
  const editionMemberships = await db.execute(sql`
    select tenant_membership_id, edition_id, program_access, website_content_access, tickets_access
    from edition_memberships where tenant_id = ${tenantId} order by tenant_membership_id, edition_id
  `)
  const programItems = await db.execute(sql`
    select id, edition_id, title, description, starts_at, ends_at
    from program_items where tenant_id = ${tenantId} order by id
  `)
  const programItemSpeakers = await db.execute(sql`
    select program_item_id, account_id
    from program_item_speakers where tenant_id = ${tenantId} order by program_item_id, account_id
  `)
  const orders = await db.execute(sql`
    select id, status, holder_name, email, holds, canceled_at, declined_at
    from orders where tenant_id = ${tenantId} order by id
  `)
  const orderLines = await db.execute(sql`
    select id, order_id, merchandise_variant_id, handed_out_at, handed_out_by
    from order_lines where tenant_id = ${tenantId} order by id
  `)
  const scanners = await db.execute(sql`
    select id, name, paired_at, revoked_at
    from scanner_devices where tenant_id = ${tenantId} order by id
  `)
  return {
    tenant,
    logos: [...logos],
    files: [...files],
    sellers: [...sellers],
    providerAccounts: [...providerAccounts],
    shops: [...shops],
    documents: [...documents],
    documentVersions: [...documentVersions],
    consents: [...consents],
    catalog,
    editions: [...editions],
    memberships: [...memberships],
    editionMemberships: [...editionMemberships],
    programItems: [...programItems],
    programItemSpeakers: [...programItemSpeakers],
    orders: [...orders],
    orderLines: [...orderLines],
    scanners: [...scanners],
  }
}

/**
 * Sets a membership to expire `ms` milliseconds from now, measured by the database, and returns
 * that moment. It is whole milliseconds, so a body may carry the exact expiry the row holds.
 */
export async function expireIn(membershipId: string, ms: number) {
  const [row] = await db.execute<{ epochMs: string }>(sql`
    update tenant_memberships
    set expires_at = date_trunc('milliseconds', now() + make_interval(secs => ${ms / 1000}))
    where id = ${membershipId}
    returning (extract(epoch from expires_at) * 1000)::bigint as "epochMs"
  `)
  return new Date(Number(row!.epochMs))
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const countHeads = async (tenantId: string) =>
  (
    await db.execute<{ count: number }>(
      sql`select count(*)::int as count from tenant_memberships where tenant_id = ${tenantId} and role = 'head'`,
    )
  )[0]!.count

export async function addHead(tenantId: string, account: { id: string }) {
  await db.execute(sql`
    insert into tenant_memberships (account_id, tenant_id, role) values (${account.id}, ${tenantId}, 'head')
  `)
}

/** The rows that reference an account, by table. */
export const accountRows = async (accountId: string) =>
  (
    await db.execute<{
      accounts: number
      tenantMemberships: number
      editionMemberships: number
    }>(sql`
      select
        (select count(*)::int from accounts where id = ${accountId}) as "accounts",
        (select count(*)::int from tenant_memberships where account_id = ${accountId}) as "tenantMemberships",
        (select count(*)::int from edition_memberships em
           join tenant_memberships tm on tm.id = em.tenant_membership_id
          where tm.account_id = ${accountId}) as "editionMemberships"
    `)
  )[0]!

/** The account's membership in the tenant and its edition rows, as stored. */
export async function storedMembership(tenantId: string, accountId: string) {
  const [membership] = await db.execute<{
    id: string
    role: string
    settingsAccess: string
    brandingAccess: string
    shopConfigAccess: string
    expiresAt: Date | null
  }>(sql`
    select id, role, settings_access as "settingsAccess", branding_access as "brandingAccess",
      shop_config_access as "shopConfigAccess", expires_at as "expiresAt"
    from tenant_memberships where tenant_id = ${tenantId} and account_id = ${accountId}
  `)
  if (!membership) return undefined
  const editions = await db.execute<{
    editionId: string
    programAccess: string
    websiteContentAccess: string
    ticketsAccess: string
  }>(sql`
    select edition_id as "editionId", program_access as "programAccess",
      website_content_access as "websiteContentAccess", tickets_access as "ticketsAccess"
    from edition_memberships where tenant_membership_id = ${membership.id}
  `)
  return { ...membership, editions: [...editions] }
}

export async function removeMembership(id: string) {
  await db.execute(sql`delete from tenant_memberships where id = ${id}`)
}

export async function deleteEdition(id: string) {
  await db.execute(sql`delete from editions where id = ${id}`)
}
