import { isLocale, isTimeZone } from '@opos/i18n'
import { eq } from 'drizzle-orm'
import type { Database } from './client'
import { accounts, RESERVED_TENANT_SLUGS, tenantMemberships, tenants } from './schema'

export interface CreateTenantInput {
  slug: string
  name: string
  headEmail: string
  defaultLocale?: string
  timezone?: string
}

export interface RenameTenantInput {
  slug: string
  newSlug: string
}

export type TenantErrorCode =
  | 'tenant.not-found'
  | 'tenant.slug-invalid'
  | 'tenant.slug-reserved'
  | 'tenant.slug-taken'
  | 'tenant.name-empty'
  | 'tenant.locale-invalid'
  | 'tenant.timezone-invalid'
  | 'account.not-found'

export class TenantError extends Error {
  constructor(
    readonly code: TenantErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TenantError'
  }
}

const SLUG = /^[a-z0-9-]{3,40}$/

function assertSlug(slug: string) {
  if (!SLUG.test(slug)) {
    throw new TenantError('tenant.slug-invalid', `Slug must match ${SLUG}: ${slug}`)
  }
  if ((RESERVED_TENANT_SLUGS as readonly string[]).includes(slug)) {
    throw new TenantError('tenant.slug-reserved', `The slug ${slug} is reserved for the platform`)
  }
}

/**
 * Creates a tenant and its first head in one transaction (PLAN.md 14). The head's account must
 * already exist. Runs on a connection that may write tenants outside a tenant context.
 */
export async function createTenant(db: Database, input: CreateTenantInput) {
  const name = input.name.trim()
  const email = input.headEmail.trim().toLowerCase()
  const defaultLocale = input.defaultLocale ?? 'pl'
  const timezone = input.timezone ?? 'Europe/Warsaw'

  assertSlug(input.slug)
  if (!name) throw new TenantError('tenant.name-empty', 'Name must not be empty')
  if (!isLocale(defaultLocale)) {
    throw new TenantError('tenant.locale-invalid', `Unsupported locale: ${defaultLocale}`)
  }
  if (!isTimeZone(timezone)) {
    throw new TenantError('tenant.timezone-invalid', `Unknown IANA time zone: ${timezone}`)
  }

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, email))
    if (!account) {
      throw new TenantError('account.not-found', `No account with the email ${email}`)
    }

    const [tenant] = await tx
      .insert(tenants)
      .values({ slug: input.slug, name, defaultLocale, timezone })
      .onConflictDoNothing({ target: tenants.slug })
      .returning({ id: tenants.id, slug: tenants.slug })
    if (!tenant) {
      throw new TenantError('tenant.slug-taken', `The slug ${input.slug} is taken`)
    }

    await tx
      .insert(tenantMemberships)
      .values({ accountId: account.id, tenantId: tenant.id, role: 'head' })
    return { ...tenant, headAccountId: account.id }
  })
}

/** The constraint a Postgres error names; drizzle wraps query errors in `cause`. */
function violatedConstraint(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const name = (current as { constraint_name?: unknown }).constraint_name
    if (typeof name === 'string') return name
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/**
 * Moves a tenant to another slug, its public address (PLAN.md 14). No endpoint changes a slug; the
 * admin does it through this function, on a connection that may write tenants. A taken slug is left
 * to tenants_slug_unique, so a rename racing another one still ends in `tenant.slug-taken`.
 */
export async function renameTenant(db: Database, input: RenameTenantInput) {
  assertSlug(input.newSlug)

  let renamed: { id: string; slug: string }[]
  try {
    renamed = await db
      .update(tenants)
      .set({ slug: input.newSlug })
      .where(eq(tenants.slug, input.slug))
      .returning({ id: tenants.id, slug: tenants.slug })
  } catch (error) {
    if (violatedConstraint(error) !== 'tenants_slug_unique') throw error
    throw new TenantError('tenant.slug-taken', `The slug ${input.newSlug} is taken`)
  }
  const [tenant] = renamed
  if (!tenant) throw new TenantError('tenant.not-found', `No tenant with the slug ${input.slug}`)
  return tenant
}
