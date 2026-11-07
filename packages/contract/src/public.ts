import { z } from 'zod'
import { publicRoute, timestamp } from './common'

// What a convention's page shows to anyone. A field added here is public at once.

export const publicTenantSchema = z.object({
  name: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
})

export const publicEditionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  startsAt: timestamp,
  endsAt: timestamp,
  isActive: z.boolean(),
})

export type PublicEdition = z.infer<typeof publicEditionSchema>

export const publicProgramItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: timestamp,
  endsAt: timestamp,
  speakers: z.array(
    z.object({ firstName: z.string().nullable(), lastName: z.string().nullable() }),
  ),
  likeCount: z.number().int().nonnegative(),
})

export type PublicProgramItem = z.infer<typeof publicProgramItemSchema>

const tenant = z.object({ params: z.object({ slug: z.string() }) })
const edition = z.object({ params: z.object({ slug: z.string(), editionSlug: z.string() }) })
const programItem = z.object({
  params: z.object({ slug: z.string(), editionSlug: z.string(), programItemId: z.string() }),
})

export const publicContract = {
  tenant: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}',
      summary: "A convention's name, language and time zone; no sign-in",
    })
    .input(tenant)
    .output(publicTenantSchema),
  editions: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/editions',
      summary: 'The published editions, newest first; no sign-in',
    })
    .input(tenant)
    .output(z.array(publicEditionSchema)),
  activeEdition: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/active-edition',
      summary: 'The active edition while it is published; no sign-in',
    })
    .input(tenant)
    .output(publicEditionSchema),
  edition: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/editions/{editionSlug}',
      summary: 'A published edition; no sign-in',
    })
    .input(edition)
    .output(publicEditionSchema),
  programItems: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/editions/{editionSlug}/program-items',
      summary: "A published edition's programme by start time; no sign-in",
    })
    .input(edition)
    .output(z.array(publicProgramItemSchema)),
  programItem: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/editions/{editionSlug}/program-items/{programItemId}',
      summary: 'One programme item of a published edition; no sign-in',
    })
    .input(programItem)
    .output(publicProgramItemSchema),
}
