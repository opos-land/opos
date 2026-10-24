import { randomUUID } from 'node:crypto'
import { accounts, createTenant, type Database, tenants } from '@opos/db'
import { inArray, sql } from 'drizzle-orm'

// The tenant a scenario works on: its own slug, created with createTenant as an admin creates one
// (PLAN.md 14), and the team written directly as opos_migrator, as the seed writes it.

type Level = 'none' | 'read' | 'write'

const DAY = 24 * 60 * 60 * 1000

export interface TenantInput {
  /** A confirmed account: createTenant refuses any other (PLAN.md 14, Creating a tenant). */
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
}

export interface OrgInput {
  settings?: Level
  shopConfig?: Level
  /** An expiry a day in the past. */
  expired?: boolean
}

export interface EditionAccess {
  program?: Level
  tickets?: Level
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
      insert into editions (tenant_id, slug, name, starts_at, ends_at, is_active, is_published)
      values (${tenantId}, ${slug}, ${input.name ?? `Edition ${slug}`}, ${startsAt.toISOString()},
        ${endsAt.toISOString()}, ${input.isActive ?? false}, ${input.isPublished ?? false})
      returning id
    `)
    return { id: row!.id, slug, name: input.name ?? `Edition ${slug}` }
  }

  /** An org membership; returns its id. */
  async addOrg(tenantId: string, accountId: string, input: OrgInput = {}) {
    const expiresAt = input.expired ? sql`now() - interval '1 day'` : null
    const [row] = await this.db.execute<{ id: string }>(sql`
      insert into tenant_memberships (account_id, tenant_id, role, settings_access,
        shop_config_access, expires_at)
      values (${accountId}, ${tenantId}, 'org', ${input.settings ?? 'none'},
        ${input.shopConfig ?? 'none'}, ${expiresAt})
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

  /** Tenants go before their accounts: a tenant's last head cannot leave while it exists. */
  async cleanup() {
    if (this.created.length === 0) return
    await this.db.delete(tenants).where(inArray(tenants.id, this.created.splice(0)))
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
