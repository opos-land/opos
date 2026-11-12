import { isLocale, isTimeZone } from '@opos/i18n'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { Database } from './client'
import type { Transaction } from './rls'
import { accounts, RESERVED_TENANT_SLUGS, tenantMemberships, tenants } from './schema'

/** A pool, or the transaction of a caller that commits the change with its own work. */
export type Executor = Database | Transaction

export interface CreateTenantInput {
  slug: string
  name: string
  headEmail: string
  defaultLocale?: string
  timezone?: string
}

/** The tenant by its identifier, or by the slug it has now. */
export type RenameTenantInput = { newSlug: string } & ({ id: string } | { slug: string })

export type TenantErrorCode =
  | 'tenant.not-found'
  | 'tenant.not-suspended'
  | 'tenant.slug-invalid'
  | 'tenant.slug-reserved'
  | 'tenant.slug-retired'
  | 'tenant.slug-taken'
  | 'tenant.name-empty'
  | 'tenant.locale-invalid'
  | 'tenant.timezone-invalid'
  | 'account.not-found'
  | 'account.unconfirmed'

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

/** The refusal of a slug the database turned down, by the constraint it names. */
function slugRefusal(error: unknown, slug: string): TenantError | undefined {
  switch (violatedConstraint(error)) {
    case 'tenants_slug_unique':
      return new TenantError('tenant.slug-taken', `The slug ${slug} is taken`)
    case 'tenants_slug_not_retired':
      return new TenantError('tenant.slug-retired', `The slug ${slug} belonged to a deleted tenant`)
    default:
      return undefined
  }
}

/**
 * Creates a tenant and its first head in one transaction. The head's account must
 * already exist with a confirmed email. Runs on a connection that may write tenants
 * outside a tenant context, as opos_admin or as postgres.
 */
export async function createTenant(db: Executor, input: CreateTenantInput) {
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
      .select({ id: accounts.id, emailConfirmedAt: accounts.emailConfirmedAt })
      .from(accounts)
      .where(eq(accounts.email, email))
    if (!account) {
      throw new TenantError('account.not-found', `No account with the email ${email}`)
    }
    if (!account.emailConfirmedAt) {
      throw new TenantError(
        'account.unconfirmed',
        `The account ${email} has not confirmed its email`,
      )
    }

    // A taken slug is left to the conflict, and a retired one to tenants_slug_not_retired, so a
    // creation racing a deletion of the same slug still ends in `tenant.slug-retired`.
    const [tenant] = await tx
      .insert(tenants)
      .values({ slug: input.slug, name, defaultLocale, timezone })
      .onConflictDoNothing({ target: tenants.slug })
      .returning({ id: tenants.id, slug: tenants.slug })
      .catch((error: unknown) => {
        throw slugRefusal(error, input.slug) ?? error
      })
    if (!tenant) {
      throw new TenantError('tenant.slug-taken', `The slug ${input.slug} is taken`)
    }

    await tx
      .insert(tenantMemberships)
      .values({ accountId: account.id, tenantId: tenant.id, role: 'head' })
    return { ...tenant, headAccountId: account.id }
  })
}

/**
 * Moves a tenant to another slug, its public address. Only the admin changes a slug, on a
 * connection that may write tenants. A taken slug is left to tenants_slug_unique and a retired one
 * to tenants_slug_not_retired, so a rename racing another one, or a deletion, still ends in its
 * code. The slug the tenant leaves is free at once.
 */
export async function renameTenant(db: Executor, input: RenameTenantInput) {
  assertSlug(input.newSlug)

  const [tenant] = await db
    .update(tenants)
    .set({ slug: input.newSlug })
    .where('id' in input ? eq(tenants.id, input.id) : eq(tenants.slug, input.slug))
    .returning({ id: tenants.id, slug: tenants.slug })
    .catch((error: unknown) => {
      throw slugRefusal(error, input.newSlug) ?? error
    })
  if (!tenant) {
    throw new TenantError(
      'tenant.not-found',
      'id' in input ? `No tenant ${input.id}` : `No tenant with the slug ${input.slug}`,
    )
  }
  return tenant
}

/**
 * Sets or clears `suspended_at` under a lock of the tenant's row, and says whether that changed
 * anything: a tenant already in the state asked for stays as it was.
 */
async function setSuspended(db: Executor, id: string, suspended: boolean) {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id, slug: tenants.slug, suspendedAt: tenants.suspendedAt })
      .from(tenants)
      .where(eq(tenants.id, id))
      .for('update')
    if (!tenant) throw new TenantError('tenant.not-found', `No tenant ${id}`)

    const changed = (tenant.suspendedAt !== null) !== suspended
    if (changed) {
      await tx
        .update(tenants)
        .set({ suspendedAt: suspended ? sql`now()` : null })
        .where(eq(tenants.id, id))
    }
    return { id: tenant.id, slug: tenant.slug, changed }
  })
}

/**
 * Suspends a tenant: off for everyone but the admin, with everything it owns kept
 * (docs/adr/0031-suspend-a-tenant-before-deleting-it.md). The API refuses a suspended tenant
 * where it opens a tenant transaction; the database only holds the state.
 */
export const suspendTenant = (db: Executor, id: string) => setSuspended(db, id, true)

/** Restores a suspended tenant, as it was. */
export const restoreTenant = (db: Executor, id: string) => setSuspended(db, id, false)

/**
 * Deletes a suspended tenant with everything it owns; the accounts stay. One statement both
 * judges the suspension and deletes, so a tenant restored meanwhile is refused. The trigger
 * tenants_retire_slug holds its slug back for good.
 */
export async function deleteTenant(db: Executor, id: string) {
  const [deleted] = await db
    .delete(tenants)
    .where(and(eq(tenants.id, id), isNotNull(tenants.suspendedAt)))
    .returning({ id: tenants.id, slug: tenants.slug })
  if (deleted) return deleted

  const [left] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id))
  if (!left) throw new TenantError('tenant.not-found', `No tenant ${id}`)
  throw new TenantError('tenant.not-suspended', `The tenant ${id} is not suspended`)
}
