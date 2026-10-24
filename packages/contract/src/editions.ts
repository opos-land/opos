import { z } from 'zod/v4'
import { level, tenantRoute, timestamp } from './common'
import { memberAccountSchema } from './tenants'

/** Part of the convention page addresses (PRODUCT.md 6): lowercase letters, digits, hyphens. */
export const editionSlug = z.string().regex(/^[a-z0-9-]{1,40}$/)

export const editionSchema = z.object({
  id: z.uuid(),
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
  tenantMembershipId: z.uuid(),
  account: memberAccountSchema,
  programAccess: level,
  websiteContentAccess: level,
  ticketsAccess: level,
})

export type EditionMember = z.infer<typeof editionMemberSchema>

export const editionAccessSchema = z
  .object({ programAccess: level, websiteContentAccess: level, ticketsAccess: level })
  .strict()

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const editionMember = z.object({
  params: z.object({ editionId: z.string(), tenantMembershipId: z.string() }),
})

export const editionsContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions',
      summary: 'Every edition of the tenant, newest first; needs a membership',
    })
    .output(z.array(editionSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions',
      successStatus: 201,
      summary: 'Create an edition, inactive and unpublished; needs settings=write',
    })
    .input(z.object({ body: createEditionSchema }))
    .output(editionSchema),
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}',
      summary: 'One edition; needs a membership',
    })
    .input(edition)
    .output(editionSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}',
      summary: 'Change an edition, publication included; needs settings=write',
    })
    .input(edition.extend({ body: updateEditionSchema }))
    .output(editionSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}',
      successStatus: 204,
      summary: 'Delete an inactive edition; needs settings=write',
    })
    .input(edition),
  activate: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/activate',
      summary: 'Make the edition the active one, deactivating the previous; needs settings=write',
    })
    .input(edition)
    .output(editionSchema),
  members: {
    list: tenantRoute
      .route({
        method: 'GET',
        path: '/editions/{editionId}/members',
        summary: 'Edition-level permissions of the team; needs settings>=read',
      })
      .input(edition)
      .output(z.array(editionMemberSchema)),
    put: tenantRoute
      .route({
        method: 'PUT',
        path: '/editions/{editionId}/members/{tenantMembershipId}',
        summary:
          "Set an org's edition-level permissions; needs settings=write, passes anti-escalation",
      })
      .input(editionMember.extend({ body: editionAccessSchema }))
      .output(editionMemberSchema),
    remove: tenantRoute
      .route({
        method: 'DELETE',
        path: '/editions/{editionId}/members/{tenantMembershipId}',
        successStatus: 204,
        summary: "Remove an org's access to the edition; needs settings=write",
      })
      .input(editionMember),
  },
}
