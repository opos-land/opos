import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { errorSchema, timestamp } from './common'
import { level, memberAccountSchema, tenantHeaders } from './tenants'

const c = initContract()

/** Part of the convention page addresses (PRODUCT.md 6): lowercase letters, digits, hyphens. */
export const editionSlug = z.string().regex(/^[a-z0-9-]{1,40}$/)

export const editionSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  startsAt: timestamp,
  endsAt: timestamp,
  isActive: z.boolean(),
  isPublished: z.boolean(),
})

export type Edition = z.infer<typeof editionSchema>

const editionFields = z.object({
  slug: editionSlug,
  name: z.string().trim().min(1).max(200),
  startsAt: timestamp,
  endsAt: timestamp,
})

const endsAfterStart = (e: { startsAt?: string; endsAt?: string }) =>
  !e.startsAt || !e.endsAt || new Date(e.endsAt) > new Date(e.startsAt)
const endsAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] }

export const createEditionSchema = editionFields
  .strict()
  .refine(endsAfterStart, endsAfterStartIssue)

export const updateEditionSchema = editionFields
  .extend({ isPublished: z.boolean() })
  .partial()
  .strict()
  .refine(endsAfterStart, endsAfterStartIssue)

export const editionMemberSchema = z.object({
  tenantMembershipId: z.string().uuid(),
  account: memberAccountSchema,
  programAccess: level,
  websiteContentAccess: level,
  ticketsAccess: level,
})

export type EditionMember = z.infer<typeof editionMemberSchema>

export const editionAccessSchema = z
  .object({ programAccess: level, websiteContentAccess: level, ticketsAccess: level })
  .strict()

const errors = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
const editionId = z.object({ editionId: z.string() })
const editionMember = z.object({ editionId: z.string(), tenantMembershipId: z.string() })

export const editionsContract = c.router({
  list: {
    method: 'GET',
    path: '/editions',
    headers: tenantHeaders,
    responses: { 200: z.array(editionSchema), ...errors },
    summary: 'Every edition of the tenant, newest first; needs a membership',
  },
  create: {
    method: 'POST',
    path: '/editions',
    headers: tenantHeaders,
    body: createEditionSchema,
    responses: { 201: editionSchema, ...errors, 409: errorSchema },
    summary: 'Create an edition, inactive and unpublished; needs settings=write',
  },
  get: {
    method: 'GET',
    path: '/editions/:editionId',
    headers: tenantHeaders,
    pathParams: editionId,
    responses: { 200: editionSchema, ...errors },
    summary: 'One edition; needs a membership',
  },
  update: {
    method: 'PATCH',
    path: '/editions/:editionId',
    headers: tenantHeaders,
    pathParams: editionId,
    body: updateEditionSchema,
    responses: { 200: editionSchema, ...errors, 409: errorSchema },
    summary: 'Change an edition, publication included; needs settings=write',
  },
  remove: {
    method: 'DELETE',
    path: '/editions/:editionId',
    headers: tenantHeaders,
    pathParams: editionId,

    responses: { 204: c.noBody(), ...errors, 409: errorSchema },
    summary: 'Delete an inactive edition; needs settings=write',
  },
  activate: {
    method: 'POST',
    path: '/editions/:editionId/activate',
    headers: tenantHeaders,
    pathParams: editionId,
    body: c.noBody(),
    responses: { 200: editionSchema, ...errors },
    summary: 'Make the edition the active one, deactivating the previous; needs settings=write',
  },
  members: {
    list: {
      method: 'GET',
      path: '/editions/:editionId/members',
      headers: tenantHeaders,
      pathParams: editionId,
      responses: { 200: z.array(editionMemberSchema), ...errors },
      summary: 'Edition-level permissions of the team; needs settings>=read',
    },
    put: {
      method: 'PUT',
      path: '/editions/:editionId/members/:tenantMembershipId',
      headers: tenantHeaders,
      pathParams: editionMember,
      body: editionAccessSchema,
      responses: { 200: editionMemberSchema, ...errors, 409: errorSchema },
      summary:
        "Set an org's edition-level permissions; needs settings=write, passes anti-escalation",
    },
    remove: {
      method: 'DELETE',
      path: '/editions/:editionId/members/:tenantMembershipId',
      headers: tenantHeaders,
      pathParams: editionMember,

      responses: { 204: c.noBody(), ...errors, 409: errorSchema },
      summary: "Remove an org's access to the edition; needs settings=write",
    },
  },
})
