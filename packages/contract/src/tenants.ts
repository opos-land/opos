import { isTimeZone, SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod/v4'
import { level, tenantRoute, timestamp } from './common'

export const tenantSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
})

export type Tenant = z.infer<typeof tenantSchema>

/** The slug, the convention's address, changes only through the admin (PLAN.md 14). */
export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    defaultLocale: z.enum(SUPPORTED_LOCALES),
    timezone: z.string().refine(isTimeZone, 'Unknown IANA time zone'),
  })
  .partial()
  .strict()

export type UpdateTenant = z.infer<typeof updateTenantSchema>

export const memberAccountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

/** A team member as the team screen shows it; expired memberships included and flagged. */
export const memberSchema = z.object({
  id: z.uuid(),
  account: memberAccountSchema,
  role: z.enum(['head', 'org']),
  settingsAccess: level,
  brandingAccess: level,
  shopConfigAccess: level,
  expiresAt: timestamp.nullable(),
  expired: z.boolean(),
})

export type Member = z.infer<typeof memberSchema>

export const updateMemberSchema = z
  .object({
    role: z.enum(['head', 'org']),
    settingsAccess: level,
    brandingAccess: level,
    shopConfigAccess: level,
    /** `null` removes the expiry. A head never expires. */
    expiresAt: timestamp.nullable(),
  })
  .partial()
  .strict()
  .refine((m) => !(m.role === 'head' && m.expiresAt), {
    message: 'A head membership never expires',
    path: ['expiresAt'],
  })

export type UpdateMember = z.infer<typeof updateMemberSchema>

const membership = z.object({ params: z.object({ membershipId: z.string() }) })

export const tenantsContract = {
  current: tenantRoute
    .route({
      method: 'GET',
      path: '/tenants/current',
      summary: 'The tenant of X-Tenant-Slug; needs a membership',
    })
    .output(tenantSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/tenants/current',
      summary: 'Change the name, language or time zone of the tenant; needs settings=write',
    })
    .input(z.object({ body: updateTenantSchema }))
    .output(tenantSchema),
  members: {
    list: tenantRoute
      .route({
        method: 'GET',
        path: '/tenants/current/members',
        summary: 'The team; needs settings>=read',
      })
      .output(z.array(memberSchema)),
    update: tenantRoute
      .route({
        method: 'PATCH',
        path: '/tenants/current/members/{membershipId}',
        summary: 'Change a member; needs settings=write and passes anti-escalation',
      })
      .input(membership.extend({ body: updateMemberSchema }))
      .output(memberSchema),
    remove: tenantRoute
      .route({
        method: 'DELETE',
        path: '/tenants/current/members/{membershipId}',
        successStatus: 204,
        summary: 'Remove a member; needs settings=write and passes anti-escalation',
      })
      .input(membership),
  },
}
