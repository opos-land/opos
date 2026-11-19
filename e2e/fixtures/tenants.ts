import { randomUUID } from 'node:crypto'
import { accounts, createTenant, type Database, tenants } from '@opos/db'
import { providerAccountOf, seal, sealingKey } from '@opos/db/sealed'
import { inArray, sql } from 'drizzle-orm'
import { apiEnv } from './stack'

// The tenant a scenario works on: its own slug, created with createTenant as an admin creates one,
// and the team written directly as postgres, as the seed writes it.

type Level = 'none' | 'read' | 'write'

const DAY = 24 * 60 * 60 * 1000

export interface TenantInput {
  /** A confirmed account: createTenant refuses any other. */
  headEmail: string
  name?: string
  timezone?: string
  defaultLocale?: string
}

export interface EditionInput {
  name?: string
  slug?: string
  /** Days from now to the start; the edition lasts two days. */
  startsInDays?: number
  isActive?: boolean
  isPublished?: boolean
  /** Where the edition takes place, as an org sets it in the edition's settings. */
  venue?: { name?: string; address?: string; city?: string }
}

export interface OrgInput {
  settings?: Level
  branding?: Level
  shopConfig?: Level
  /** An expiry a day in the past. */
  expired?: boolean
}

export interface EditionAccess {
  program?: Level
  tickets?: Level
}

/** What a convention sets of its shop before any edition sells. */
export interface ShopInput {
  /**
   * The credentials of its account with the fake provider, sealed as the API seals them; left
   * out, the convention has connected no account.
   */
  credentials?: Record<string, string>
  /** Left out, the seller's details are complete. */
  seller?: false
}

/** The seller's details a scenario's convention holds once they are set. */
export const SELLER = {
  name: 'Seller Ltd',
  address: '1 Main St, 00-001 Warszawa',
  registrationNumber: 'KRS 0000000000',
  contactEmail: 'shop@seller.test',
}

export class TenantFactory {
  private readonly created: string[] = []

  constructor(private readonly db: Database) {}

  async create(input: TenantInput) {
    const slug = `e2e-${randomUUID().slice(0, 8)}`
    const name = input.name ?? `Convention ${slug.slice(4)}`
    const { id } = await createTenant(this.db, { slug, name, ...input })
    this.created.push(id)
    return { id, slug, name }
  }

  async addEdition(tenantId: string, input: EditionInput = {}) {
    const slug = input.slug ?? randomUUID().slice(0, 8)
    const startsAt = new Date(Date.now() + (input.startsInDays ?? 90) * DAY)
    const endsAt = new Date(startsAt.getTime() + 2 * DAY)
    const [row] = await this.db.execute<{ id: string }>(sql`
      insert into editions (tenant_id, slug, name, starts_at, ends_at, is_active, is_published,
        venue_name, venue_address, venue_city)
      values (${tenantId}, ${slug}, ${input.name ?? `Edition ${slug}`}, ${startsAt.toISOString()},
        ${endsAt.toISOString()}, ${input.isActive ?? false}, ${input.isPublished ?? false},
        ${input.venue?.name ?? null}, ${input.venue?.address ?? null}, ${input.venue?.city ?? null})
      returning id
    `)
    return { id: row!.id, slug, name: input.name ?? `Edition ${slug}` }
  }

  /** A programme item of an edition, an hour long; returns its id. */
  async addProgramItem(tenantId: string, editionId: string, title: string, startsAt: string) {
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString()
    const [row] = await this.db.execute<{ id: string }>(sql`
      insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
      values (${tenantId}, ${editionId}, ${title}, ${startsAt}, ${endsAt})
      returning id
    `)
    return row!.id
  }

  /** An org membership; returns its id. */
  async addOrg(tenantId: string, accountId: string, input: OrgInput = {}) {
    const expiresAt = input.expired ? sql`now() - interval '1 day'` : null
    const [row] = await this.db.execute<{ id: string }>(sql`
      insert into tenant_memberships (account_id, tenant_id, role, settings_access,
        branding_access, shop_config_access, expires_at)
      values (${accountId}, ${tenantId}, 'org', ${input.settings ?? 'none'},
        ${input.branding ?? 'none'}, ${input.shopConfig ?? 'none'}, ${expiresAt})
      returning id
    `)
    return row!.id
  }

  async addEditionAccess(
    tenantId: string,
    membershipId: string,
    editionId: string,
    access: EditionAccess,
  ) {
    await this.db.execute(sql`
      insert into edition_memberships (tenant_id, tenant_membership_id, edition_id,
        program_access, tickets_access)
      values (${tenantId}, ${membershipId}, ${editionId}, ${access.program ?? 'none'},
        ${access.tickets ?? 'none'})
    `)
  }

  /**
   * The convention's side of the shop's setup, as its rows: complete seller's details, and an
   * account of the fake provider that is ready to sell, with its credentials sealed by the key of
   * the API under test.
   */
  async setUpShop(tenantId: string, input: ShopInput = {}) {
    if (input.seller !== false) {
      await this.db.execute(sql`
        insert into shop_sellers (tenant_id, seller_name, seller_address,
          seller_registration_number, contact_email)
        values (${tenantId}, ${SELLER.name}, ${SELLER.address}, ${SELLER.registrationNumber},
          ${SELLER.contactEmail})
      `)
    }
    if (input.credentials) {
      const key = apiEnv.PAYMENT_CREDENTIALS_KEY
      if (!key) throw new Error('PAYMENT_CREDENTIALS_KEY is missing; run pnpm infra:init')
      const sealed = seal(
        sealingKey(key),
        JSON.stringify(input.credentials),
        providerAccountOf(tenantId, 'fake'),
      )
      await this.db.execute(sql`
        insert into payment_provider_accounts (tenant_id, provider, credentials, ready_at)
        values (${tenantId}, 'fake', ${sealed}, now())
      `)
    }
  }

  /**
   * A legal document of an edition with one published version, as its rows alone: nothing lies in
   * the bucket, so a scenario that downloads a version publishes it through the panel instead.
   */
  async addDocument(
    tenantId: string,
    editionId: string,
    kind: 'shop-terms' | 'privacy-policy' | 'edition-rules' | 'other',
    title: string = kind,
  ) {
    const [document] = await this.db.execute<{ id: string }>(sql`
      insert into edition_documents (tenant_id, edition_id, kind, title)
      values (${tenantId}, ${editionId}, ${kind}, ${title})
      returning id
    `)
    const [file] = await this.db.execute<{ id: string }>(sql`
      insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
      values (${tenantId}, ${editionId}, 'edition-document', 'application/pdf', 10,
        repeat('d', 64), 'document.pdf')
      returning id
    `)
    await this.db.execute(sql`
      insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
      values (${tenantId}, ${editionId}, ${document!.id}, 1, ${file!.id})
    `)
    return document!.id
  }

  /**
   * A small catalog of an edition, as its rows alone: a ticket type with a price in force now, an
   * add-on it offers, a merchandise item sold as one variant, and a custom field.
   */
  async addCatalog(tenantId: string, editionId: string) {
    const at = sql`${tenantId}, ${editionId}`
    const [ticketType] = await this.db.execute<{ id: string }>(sql`
      insert into ticket_types (tenant_id, edition_id, name, sale_starts_at, sale_ends_at,
        allows_child, allows_teen, allows_adult, position)
      values (${at}, 'Standard', now() - interval '30 days', now() + interval '30 days', false,
        true, true, 1)
      returning id
    `)
    await this.db.execute(sql`
      insert into ticket_type_price_tiers (tenant_id, edition_id, ticket_type_id, amount_minor,
        starts_at, ends_at)
      values (${at}, ${ticketType!.id}, 12000, now() - interval '30 days',
        now() + interval '30 days')
    `)
    const [addOn] = await this.db.execute<{ id: string }>(sql`
      insert into add_ons (tenant_id, edition_id, name, amount_minor, kind, capacity, position)
      values (${at}, 'Workshop', 4000, 'limited', 30, 1)
      returning id
    `)
    await this.db.execute(sql`
      insert into ticket_type_add_ons (tenant_id, edition_id, ticket_type_id, add_on_id)
      values (${at}, ${ticketType!.id}, ${addOn!.id})
    `)
    const [item] = await this.db.execute<{ id: string }>(sql`
      insert into merchandise_items (tenant_id, edition_id, name, amount_minor, per_order_limit,
        position)
      values (${at}, 'Enamel pin', 1500, 10, 1)
      returning id
    `)
    await this.db.execute(sql`
      insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
      values (${at}, ${item!.id}, 200)
    `)
    await this.db.execute(sql`
      insert into edition_custom_fields (tenant_id, edition_id, label, is_required, position)
      values (${at}, 'City you travel from', true, 1)
    `)
    return { ticketTypeId: ticketType!.id, addOnId: addOn!.id, itemId: item!.id }
  }

  /**
   * An edition's shop that sells, as its rows alone: the convention's side set up with an account
   * of the fake provider, the two documents opening asks for, a required consent linking the
   * terms, the small catalog with its item offered with the ticket type, a T-shirt in two sizes,
   * and the shop open. `ticketMinor` is the price of the ticket type.
   */
  async sellingShop(
    tenantId: string,
    editionId: string,
    { ticketMinor = 12000, account = 'demo' }: { ticketMinor?: number; account?: string } = {},
  ) {
    const at = sql`${tenantId}, ${editionId}`
    await this.setUpShop(tenantId, { credentials: { account } })
    const terms = await this.addDocument(tenantId, editionId, 'shop-terms', 'Shop terms')
    await this.addDocument(tenantId, editionId, 'privacy-policy', 'Privacy policy')
    await this.db.execute(sql`
      insert into edition_consents (tenant_id, edition_id, document_id, text, is_required, position)
      values (${at}, ${terms}, 'I accept the shop terms.', true, 1)
    `)
    const catalog = await this.addCatalog(tenantId, editionId)
    await this.db.execute(sql`
      update ticket_type_price_tiers set amount_minor = ${ticketMinor}
      where ticket_type_id = ${catalog.ticketTypeId}
    `)
    const [shirt] = await this.db.execute<{ id: string }>(sql`
      insert into merchandise_items (tenant_id, edition_id, name, amount_minor, per_order_limit,
        position)
      values (${at}, 'T-shirt', 8000, 5, 2)
      returning id
    `)
    const [axis] = await this.db.execute<{ id: string }>(sql`
      insert into merchandise_option_axes (tenant_id, edition_id, merchandise_item_id, name,
        position)
      values (${at}, ${shirt!.id}, 'Size', 1)
      returning id
    `)
    const variants: Record<string, string> = {}
    for (const [index, label] of ['M', 'L'].entries()) {
      const [value] = await this.db.execute<{ id: string }>(sql`
        insert into merchandise_option_values (tenant_id, edition_id, merchandise_item_id,
          axis_id, label, position)
        values (${at}, ${shirt!.id}, ${axis!.id}, ${label}, ${index + 1})
        returning id
      `)
      const [variant] = await this.db.execute<{ id: string }>(sql`
        insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
        values (${at}, ${shirt!.id}, 5)
        returning id
      `)
      await this.db.execute(sql`
        insert into merchandise_variant_values (tenant_id, edition_id, merchandise_item_id,
          variant_id, axis_id, option_value_id)
        values (${at}, ${shirt!.id}, ${variant!.id}, ${axis!.id}, ${value!.id})
      `)
      variants[label] = variant!.id
    }
    for (const itemId of [catalog.itemId, shirt!.id]) {
      await this.db.execute(sql`
        insert into ticket_type_merchandise_items (tenant_id, edition_id, ticket_type_id,
          merchandise_item_id)
        values (${at}, ${catalog.ticketTypeId}, ${itemId})
      `)
    }
    await this.db.execute(sql`
      insert into edition_shops (tenant_id, edition_id, opened_at, merch_only_enabled)
      values (${at}, now(), true)
      on conflict (edition_id) do update set opened_at = now(), merch_only_enabled = true
    `)
    return { ...catalog, shirtId: shirt!.id, shirtVariants: variants }
  }

  /** Closes the shop of an edition, with the message its page then shows. */
  async closeShop(editionId: string, message: string) {
    await this.db.execute(sql`
      update edition_shops set opened_at = null, sales_closed_message = ${message}
      where edition_id = ${editionId}
    `)
  }

  /** Sets what is left of a variant, as its stock. */
  async setStock(variantId: string, stock: number) {
    await this.db.execute(sql`
      update merchandise_variants set stock = ${stock} where id = ${variantId}
    `)
  }

  /** The orders of a tenant as stored: their status, and the account each is attached to. */
  async orders(tenantId: string) {
    return [
      ...(await this.db.execute<{ status: string; email: string; accountId: string | null }>(sql`
        select o.status, o.email, a.account_id as "accountId"
        from orders o left join order_accounts a on a.order_id = o.id
        where o.tenant_id = ${tenantId} order by o.placed_at
      `)),
    ]
  }

  /** The account's membership in the tenant as stored, or undefined. */
  async membership(tenantId: string, accountId: string) {
    const [row] = await this.db.execute<{ role: string; settingsAccess: string }>(sql`
      select role, settings_access as "settingsAccess" from tenant_memberships
      where tenant_id = ${tenantId} and account_id = ${accountId}
    `)
    return row
  }

  /** The tenant's editions as stored, by slug. */
  async editions(tenantId: string) {
    return this.db.execute<{ slug: string; isActive: boolean; isPublished: boolean }>(sql`
      select slug, is_active as "isActive", is_published as "isPublished" from editions
      where tenant_id = ${tenantId} order by slug
    `)
  }

  /** A tenant the scenario made through the admin application: it goes with the others. */
  track(id: string) {
    this.created.push(id)
  }

  /** Tenants go before their accounts: a tenant's last head cannot leave while it exists. */
  async cleanup() {
    if (this.created.length === 0) return
    const ids = this.created.splice(0)
    // An order keeps its edition, and so its tenant: a scenario's orders go first.
    await this.db.execute(sql`delete from orders where tenant_id in ${ids}`)
    await this.db.delete(tenants).where(inArray(tenants.id, ids))
  }
}

/** The ids of the accounts using these addresses, sign-ups through the UI included. */
export async function accountIds(db: Database, emails: string[]) {
  if (emails.length === 0) return []
  const lowercase = emails.map((email) => email.toLowerCase())
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(inArray(accounts.email, lowercase))
  return rows.map((row) => row.id)
}
