import { isTimeZone, SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod'
import { adminRoute, timestamp } from './common'

// The routes of the admin application (docs/specs/platform-administration.md). Each needs the
// session of that application, an account holding the admin role with the second factor of its
// grant, and a sign-in younger than 30 minutes; the two that cannot be undone need one younger
// than 5 minutes.

/** A convention's address: the slug of its tenant. */
export const tenantSlug = z.string().regex(/^[a-z0-9-]{3,40}$/)

/** A tenant as the admin sees it; `suspendedAt` is null while the tenant is not suspended. */
export const adminTenantSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
  suspendedAt: timestamp.nullable(),
  createdAt: timestamp,
})

export type AdminTenant = z.infer<typeof adminTenantSchema>

/** A head of a tenant, for the admin to reach them. */
export const adminTenantHeadSchema = z.object({
  accountId: z.uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

export const adminTenantDetailsSchema = adminTenantSchema.extend({
  heads: z.array(adminTenantHeadSchema),
})

export type AdminTenantDetails = z.infer<typeof adminTenantDetailsSchema>

/** A new tenant with its first head, an account whose email address is confirmed. */
export const createTenantSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: tenantSlug,
    defaultLocale: z.enum(SUPPORTED_LOCALES),
    timezone: z.string().refine(isTimeZone, 'Unknown IANA time zone'),
    headEmail: z.email().max(320),
  })
  .strict()

export type CreateTenant = z.infer<typeof createTenantSchema>

export const renameTenantSchema = z.object({ slug: tenantSlug }).strict()

export const resetTwoFactorSchema = z.object({ email: z.email().max(320) }).strict()

/** `emailSent` is false when the notice could not be sent: the reset stands all the same. */
export const twoFactorResetSchema = z.object({ emailSent: z.boolean() })

export const adminActionKinds = [
  'tenant.create',
  'tenant.rename',
  'tenant.suspend',
  'tenant.restore',
  'tenant.delete',
  'account.reset-2fa',
  'admin.grant',
  'admin.revoke',
] as const

/** An account an entry of the log names, as it is now; only the identifier once it is gone. */
const loggedAccountSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

/**
 * An entry of the log of the admins' actions. `admin` is null for the two scripts that grant the
 * role and take it away; `tenant` holds the slug as the action left it.
 */
export const adminActionSchema = z.object({
  id: z.uuid(),
  action: z.enum(adminActionKinds),
  admin: loggedAccountSchema.nullable(),
  tenant: z.object({ id: z.uuid(), slug: z.string() }).nullable(),
  account: loggedAccountSchema.nullable(),
  createdAt: timestamp,
})

export type AdminAction = z.infer<typeof adminActionSchema>

const tenantParams = z.object({ params: z.object({ tenantId: z.uuid() }) })

export const adminContract = {
  tenants: adminRoute
    .route({ method: 'GET', path: '/admin/tenants', summary: 'Every tenant, by name' })
    .output(z.array(adminTenantSchema)),
  tenant: adminRoute
    .route({
      method: 'GET',
      path: '/admin/tenants/{tenantId}',
      summary: 'A tenant with its heads',
    })
    .input(tenantParams)
    .output(adminTenantDetailsSchema),
  createTenant: adminRoute
    .route({
      method: 'POST',
      path: '/admin/tenants',
      successStatus: 201,
      summary: 'Create a tenant with its first head, an account with a confirmed email address',
    })
    .input(z.object({ body: createTenantSchema }))
    .output(adminTenantDetailsSchema),
  renameTenant: adminRoute
    .route({
      method: 'PUT',
      path: '/admin/tenants/{tenantId}/slug',
      summary: "Change a tenant's slug, its address; the old one is free at once",
    })
    .input(tenantParams.extend({ body: renameTenantSchema }))
    .output(adminTenantSchema),
  suspendTenant: adminRoute
    .route({
      method: 'POST',
      path: '/admin/tenants/{tenantId}/suspend',
      summary: 'Suspend a tenant: off for everyone but the admin, with everything it owns kept',
    })
    .input(tenantParams)
    .output(adminTenantSchema),
  restoreTenant: adminRoute
    .route({
      method: 'POST',
      path: '/admin/tenants/{tenantId}/restore',
      summary: 'Restore a suspended tenant, as it was',
    })
    .input(tenantParams)
    .output(adminTenantSchema),
  deleteTenant: adminRoute
    .route({
      method: 'DELETE',
      path: '/admin/tenants/{tenantId}',
      successStatus: 204,
      summary:
        'Delete a suspended tenant with everything it owns, for good; needs a sign-in from the last 5 minutes',
    })
    .input(tenantParams),
  resetTwoFactor: adminRoute
    .route({
      method: 'POST',
      path: '/admin/accounts/reset-2fa',
      summary:
        "Remove the two-factor authentication of the account with a confirmed email address, never an admin's; needs a sign-in from the last 5 minutes",
    })
    .input(z.object({ body: resetTwoFactorSchema }))
    .output(twoFactorResetSchema),
  actions: adminRoute
    .route({
      method: 'GET',
      path: '/admin/actions',
      summary: "The log of the admins' actions, newest first",
    })
    .input(
      z.object({
        query: z
          .object({
            /** Entries older than this one, by its identifier: the next page. */
            before: z.uuid().optional(),
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .strict(),
      }),
    )
    .output(z.array(adminActionSchema)),
}
