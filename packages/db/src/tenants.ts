import { isLocale, isTimeZone } from '@opos/i18n'
import { eq } from 'drizzle-orm'
import type { Database } from './client'
import { accounts, tenantMemberships, tenants } from './schema'

export interface CreateTenantInput {
  slug: string
  name: string
  headEmail: string
  defaultLocale?: string
  timezone?: string
}

export type CreateTenantErrorCode =
  | 'tenant.slug-invalid'
  | 'tenant.slug-taken'
  | 'tenant.name-empty'
  | 'tenant.locale-invalid'
  | 'tenant.timezone-invalid'
  | 'account.not-found'

export class CreateTenantError extends Error {
  constructor(
    readonly code: CreateTenantErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CreateTenantError'
  }
}

const SLUG = /^[a-z0-9-]{3,40}$/

/**
 * Creates a tenant and its first head in one transaction (PLAN.md 14). The head's account must
 * already exist. Runs on a connection that may write tenants outside a tenant context.
 */
export async function createTenant(db: Database, input: CreateTenantInput) {
  const name = input.name.trim()
  const email = input.headEmail.trim().toLowerCase()
  const defaultLocale = input.defaultLocale ?? 'pl'
  const timezone = input.timezone ?? 'Europe/Warsaw'

  if (!SLUG.test(input.slug)) {
    throw new CreateTenantError('tenant.slug-invalid', `Slug must match ${SLUG}: ${input.slug}`)
  }
  if (!name) throw new CreateTenantError('tenant.name-empty', 'Name must not be empty')
  if (!isLocale(defaultLocale)) {
    throw new CreateTenantError('tenant.locale-invalid', `Unsupported locale: ${defaultLocale}`)
  }
  if (!isTimeZone(timezone)) {
    throw new CreateTenantError('tenant.timezone-invalid', `Unknown IANA time zone: ${timezone}`)
  }

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, email))
    if (!account) {
      throw new CreateTenantError('account.not-found', `No account with the email ${email}`)
    }

    const [tenant] = await tx
      .insert(tenants)
      .values({ slug: input.slug, name, defaultLocale, timezone })
      .onConflictDoNothing({ target: tenants.slug })
      .returning({ id: tenants.id, slug: tenants.slug })
    if (!tenant) {
      throw new CreateTenantError('tenant.slug-taken', `The slug ${input.slug} is taken`)
    }

    await tx
      .insert(tenantMemberships)
      .values({ accountId: account.id, tenantId: tenant.id, role: 'head' })
    return { ...tenant, headAccountId: account.id }
  })
}
