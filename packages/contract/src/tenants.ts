import { isTimeZone, SUPPORTED_LOCALES } from '@opos/i18n'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { errorSchema, timestamp } from './common'
import { bearer } from './me'

const c = initContract()

/** Headers of every tenant route: the session and the tenant it acts in (PLAN.md 7.2). */
export const tenantHeaders = bearer.extend({ 'x-tenant-slug': z.string() })

export const level = z.enum(['none', 'read', 'write'])

export const tenantSchema = z.object({
  id: z.string().uuid(),
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
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

/** A team member as the team screen shows it; expired memberships included and flagged. */
export const memberSchema = z.object({
  id: z.string().uuid(),
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

const tenantErrors = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
const membershipId = z.object({ membershipId: z.string() })

export const tenantsContract = c.router({
  current: {
    method: 'GET',
    path: '/tenants/current',
    headers: tenantHeaders,
    responses: { 200: tenantSchema, ...tenantErrors },
    summary: 'The tenant of X-Tenant-Slug; needs a membership',
  },
  update: {
    method: 'PATCH',
    path: '/tenants/current',
    headers: tenantHeaders,
    body: updateTenantSchema,
    responses: { 200: tenantSchema, ...tenantErrors },
    summary: 'Change the name, language or time zone of the tenant; needs settings=write',
  },
  members: {
    list: {
      method: 'GET',
      path: '/tenants/current/members',
      headers: tenantHeaders,
      responses: { 200: z.array(memberSchema), ...tenantErrors },
      summary: 'The team; needs settings>=read',
    },
    update: {
      method: 'PATCH',
      path: '/tenants/current/members/:membershipId',
      headers: tenantHeaders,
      pathParams: membershipId,
      body: updateMemberSchema,
      responses: { 200: memberSchema, ...tenantErrors, 409: errorSchema },
      summary: 'Change a member; needs settings=write and passes anti-escalation',
    },
    remove: {
      method: 'DELETE',
      path: '/tenants/current/members/:membershipId',
      headers: tenantHeaders,
      pathParams: membershipId,

      responses: { 204: c.noBody(), ...tenantErrors, 409: errorSchema },
      summary: 'Remove a member; needs settings=write and passes anti-escalation',
    },
  },
})
