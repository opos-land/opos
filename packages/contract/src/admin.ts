import { isTimeZone, SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod'
import { adminRoute, timestamp } from './common'
import { nameOrderSchema } from './me'
import {
  avatarSchema,
  PROFILE_REPORT_REASONS,
  profileHeldSchema,
  profileTakedownSchema,
  TAKEDOWN_REASONS,
} from './profiles'
import { plainText } from './text'

// The routes of the admin application (docs/specs/0001-platform-administration.md). Each needs
// the session of that application, an account holding the admin role with the second factor of its
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
  'profile-report.close',
  'profile.take-down',
  'profile.restore',
  'account.clear-name',
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

// The admin's side of the public profile (docs/specs/0016-public-profile.md, T1-T14): the reports
// of profiles, the takedown of a profile and its restoring, and the clearing of an account's name.

/** The parts of an account's public name, as a list of the admin application shows an account. */
const publicNameSchema = z.object({
  firstName: z.string().nullable(),
  nickname: z.string().nullable(),
  lastName: z.string().nullable(),
  nameOrder: nameOrderSchema,
})

/** A report of a profile as the admin reads it: only here does anyone read what a report says. */
export const adminProfileReportSchema = z.object({
  id: z.uuid(),
  /** The account of the reported profile. */
  accountId: z.uuid(),
  reason: z.enum(PROFILE_REPORT_REASONS),
  note: z.string().nullable(),
  /** The address of who sent it, when they gave one. */
  email: z.string().nullable(),
  createdAt: timestamp,
  closedAt: timestamp.nullable(),
})

export type AdminProfileReport = z.infer<typeof adminProfileReportSchema>

/** A row of the list of reports: the report, and the public name of the account it is about. */
export const listedProfileReportSchema = adminProfileReportSchema.extend({
  account: publicNameSchema,
})

export type ListedProfileReport = z.infer<typeof listedProfileReportSchema>

export const profileReportStates = ['open', 'closed'] as const

/**
 * A profile as the admin sees it: as it is now, with no history of what it held. An account with
 * no profile yet shows an empty one, so that its name can be read and cleared.
 */
export const adminProfileSchema = profileHeldSchema.extend(publicNameSchema.shape).extend({
  accountId: z.uuid(),
  email: z.string(),
  /** What the address of the profile's page holds, while the profile is published. */
  profileId: z.uuid().nullable(),
  published: z.boolean(),
  avatar: avatarSchema.nullable(),
  takedown: profileTakedownSchema.nullable(),
  /** The reports of the profile, the newest first. */
  reports: z.array(adminProfileReportSchema),
})

export type AdminProfile = z.infer<typeof adminProfileSchema>

/** A row of the list of profiles taken down. */
export const takenDownProfileSchema = publicNameSchema.extend({
  accountId: z.uuid(),
  email: z.string(),
  avatar: avatarSchema.nullable(),
  takenDownAt: timestamp,
  reason: z.enum(TAKEDOWN_REASONS),
  /** When the account asked for a review, if it did. */
  reviewRequestedAt: timestamp.nullable(),
})

export type TakenDownProfile = z.infer<typeof takenDownProfileSchema>

/** A takedown: its reason, a rule of the platform's terms, and a sentence for the account. */
export const takeDownProfileSchema = z.strictObject({
  reason: z.enum(TAKEDOWN_REASONS),
  note: plainText(500).optional(),
})

export type TakeDownProfile = z.infer<typeof takeDownProfileSchema>

export const clearAccountNameSchema = z.strictObject({ reason: z.enum(TAKEDOWN_REASONS) })

export const findAccountSchema = z.strictObject({ email: z.email().max(320) })

/**
 * What an action about a profile answers: the profile as the action left it, and whether the
 * email that tells the account went out. `emailSent` is null when nothing changed, so none was
 * due.
 */
export const moderatedProfileSchema = z.object({
  profile: adminProfileSchema,
  emailSent: z.boolean().nullable(),
})

export type ModeratedProfile = z.infer<typeof moderatedProfileSchema>

/**
 * A closed report, and whether who sent it was told: null when the report gave no address, or was
 * closed already.
 */
export const closedProfileReportSchema = z.object({
  report: adminProfileReportSchema,
  emailSent: z.boolean().nullable(),
})

const reportParams = z.object({ params: z.object({ reportId: z.uuid() }) })
const accountParams = z.object({ params: z.object({ accountId: z.uuid() }) })

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
  profileReports: adminRoute
    .route({
      method: 'GET',
      path: '/admin/profile-reports',
      summary: 'The reports of profiles, the open ones or the closed ones, newest first',
    })
    .input(
      z.object({
        query: z
          .object({
            state: z.enum(profileReportStates).default('open'),
            /** Reports older than this one, by its identifier: the next page. */
            before: z.uuid().optional(),
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .strict(),
      }),
    )
    .output(z.array(listedProfileReportSchema)),
  profileReport: adminRoute
    .route({
      method: 'GET',
      path: '/admin/profile-reports/{reportId}',
      summary: 'A report of a profile',
    })
    .input(reportParams)
    .output(adminProfileReportSchema),
  closeProfileReport: adminRoute
    .route({
      method: 'POST',
      path: '/admin/profile-reports/{reportId}/close',
      summary:
        'Close a report and leave its profile as it is; who sent it is told when they gave an address',
    })
    .input(reportParams)
    .output(closedProfileReportSchema),
  takenDownProfiles: adminRoute
    .route({
      method: 'GET',
      path: '/admin/profiles',
      summary: 'The profiles taken down, those asking for a review first',
    })
    .output(z.array(takenDownProfileSchema)),
  findAccount: adminRoute
    .route({
      method: 'POST',
      path: '/admin/accounts/find',
      summary:
        'The identifier of the account a confirmed email address names; refused with account.not-found or account.unconfirmed',
    })
    .input(z.object({ body: findAccountSchema }))
    .output(z.object({ accountId: z.uuid() })),
  profile: adminRoute
    .route({
      method: 'GET',
      path: '/admin/profiles/{accountId}',
      summary:
        'The profile of an account as it is now, with its reports; an empty one for an account with none',
    })
    .input(accountParams)
    .output(adminProfileSchema),
  takeDownProfile: adminRoute
    .route({
      method: 'POST',
      path: '/admin/profiles/{accountId}/take-down',
      summary:
        'Take a profile down: it is withdrawn and cannot be published, its avatar goes and its open reports are closed; the account is told why',
    })
    .input(accountParams.extend({ body: takeDownProfileSchema }))
    .output(moderatedProfileSchema),
  restoreProfile: adminRoute
    .route({
      method: 'POST',
      path: '/admin/profiles/{accountId}/restore',
      summary: 'Restore a profile taken down: its account may publish it again',
    })
    .input(accountParams)
    .output(moderatedProfileSchema),
  clearAccountName: adminRoute
    .route({
      method: 'POST',
      path: '/admin/accounts/{accountId}/clear-name',
      summary:
        "Clear an account's first name, nickname and last name; the account is told why and may enter a name again",
    })
    .input(accountParams.extend({ body: clearAccountNameSchema }))
    .output(moderatedProfileSchema),
}
