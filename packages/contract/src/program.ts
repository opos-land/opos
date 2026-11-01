import { z } from 'zod'
import { tenantRoute, timestamp } from './common'
import { endsAfterStart, endsAfterStartIssue } from './editions'
import { memberAccountSchema } from './tenants'

export const MAX_SPEAKERS = 10

export const programItemSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: timestamp,
  endsAt: timestamp,
  speakers: z.array(memberAccountSchema),
})

export type ProgramItem = z.infer<typeof programItemSchema>

const programItemFields = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).nullable(),
  startsAt: timestamp,
  endsAt: timestamp,
})

export const createProgramItemSchema = programItemFields
  .partial({ description: true })
  .strict()
  .refine(endsAfterStart, endsAfterStartIssue)

export const updateProgramItemSchema = programItemFields
  .partial()
  .strict()
  .refine(endsAfterStart, endsAfterStartIssue)

export type UpdateProgramItem = z.infer<typeof updateProgramItemSchema>

/** The whole list of an item's speakers, by the email of their accounts. */
export const putSpeakersSchema = z
  .object({ emails: z.array(z.email().max(254)).max(MAX_SPEAKERS) })
  .strict()

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const programItem = z.object({
  params: z.object({ editionId: z.string(), programItemId: z.string() }),
})

export const programContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/program-items',
      summary: "The edition's programme items by start time; needs program>=read",
    })
    .input(edition)
    .output(z.array(programItemSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/program-items',
      successStatus: 201,
      summary: 'Create a programme item; needs program=write',
    })
    .input(edition.extend({ body: createProgramItemSchema }))
    .output(programItemSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/program-items/{programItemId}',
      summary: 'Change a programme item; needs program=write',
    })
    .input(programItem.extend({ body: updateProgramItemSchema }))
    .output(programItemSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/program-items/{programItemId}',
      successStatus: 204,
      summary: 'Delete a programme item with its speakers; needs program=write',
    })
    .input(programItem),
  speakers: {
    put: tenantRoute
      .route({
        method: 'PUT',
        path: '/editions/{editionId}/program-items/{programItemId}/speakers',
        summary:
          "Replace an item's speakers; needs program=write; an address without a confirmed account answers 404",
      })
      .input(programItem.extend({ body: putSpeakersSchema }))
      .output(programItemSchema),
  },
}
