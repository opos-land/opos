import { isTimeZone, SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod'
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

/** The edition-level permissions an invitation grants in one edition of the tenant. */
export const editionGrantSchema = z
  .object({
    editionId: z.uuid(),
    programAccess: level,
    websiteContentAccess: level,
    ticketsAccess: level,
  })
  .strict()

export type EditionGrant = z.infer<typeof editionGrantSchema>

/**
 * An organizer invitation (PLAN.md 7.7). Omitted permissions are `none`, an omitted role is `org`
 * and an omitted expiry means none; a head takes no permissions, so they are dropped for one.
 */
export const inviteMemberSchema = z
  .object({
    email: z.email().max(254),
    role: z.enum(['head', 'org']),
    settingsAccess: level,
    brandingAccess: level,
    shopConfigAccess: level,
    /** `null` or omitted: the membership never expires. A head never expires. */
    expiresAt: timestamp.nullable(),
    editions: z.array(editionGrantSchema).max(50),
  })
  .partial()
  .required({ email: true })
  .strict()
  .refine((m) => !(m.role === 'head' && m.expiresAt), {
    message: 'A head membership never expires',
    path: ['expiresAt'],
  })
  .refine((m) => !m.expiresAt || new Date(m.expiresAt) > new Date(), {
    message: 'expiresAt must be in the future',
    path: ['expiresAt'],
  })
  .refine((m) => new Set(m.editions?.map((e) => e.editionId)).size === (m.editions?.length ?? 0), {
    message: 'Each edition appears once',
    path: ['editions'],
  })

export type InviteMember = z.infer<typeof inviteMemberSchema>

/**
 * A known account with a confirmed email joins at once; any other address gets an invitation link,
 * valid until `validUntil`.
 */
export const invitationOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('added'), member: memberSchema }),
  z.object({ outcome: z.literal('invited'), email: z.string(), validUntil: timestamp }),
])

export type InvitationOutcome = z.infer<typeof invitationOutcomeSchema>

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
    invite: tenantRoute
      .route({
        method: 'POST',
        path: '/tenants/current/members',
        successStatus: 201,
        summary:
          'Invite an organizer by email; needs settings=write and passes anti-escalation. A known account with a confirmed email joins at once',
      })
      .input(z.object({ body: inviteMemberSchema }))
      .output(invitationOutcomeSchema),
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
