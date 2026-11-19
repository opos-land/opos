import { randomUUID } from 'node:crypto'
import {
  createTenant,
  migrationDb,
  migrationUrl,
  restoreTenant,
  suspendTenant,
  tenants,
  type Transaction,
} from '@opos/db'
import { inArray, sql } from 'drizzle-orm'
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

export async function tenantWithHead(defaultLocale?: string) {
  const head = await member()
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
    values (${tenantId}, ${slug}, ${slug}, ${values.startsAt ?? '2027-06-01'},
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

/** The rows a table holds of the tenant, as stored, in the order they were added. */
export const storedRows = async (table: string, tenantId: string) => [
  ...(await db.execute<Record<string, unknown>>(sql`
    select * from ${sql.identifier(table)} where tenant_id = ${tenantId}
    order by ${table === 'edition_shops' ? sql`edition_id` : sql`created_at, id`}
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
  if (tenantIds.length > 0) await db.delete(tenants).where(inArray(tenants.id, tenantIds))
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
