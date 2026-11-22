import { z } from 'zod'
import { logoSchema } from './branding'
import {
  attemptHeaders,
  offerSchema,
  orderResultSchema,
  placedOrderSchema,
  placeVisitorOrderSchema,
  quoteRequestSchema,
  quoteSchema,
  resultTokenHeaders,
  startedAttemptSchema,
} from './checkout'
import { publicRoute, timestamp } from './common'
import { nameOrderSchema } from './me'
import { publicProfileSchema } from './profiles'

// What a convention's page shows to anyone. A field added here is public at once.

export const publicTenantSchema = z.object({
  name: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
  logo: logoSchema.nullable(),
})

export type PublicTenant = z.infer<typeof publicTenantSchema>

export const publicEditionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  startsAt: timestamp,
  endsAt: timestamp,
  isActive: z.boolean(),
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  venueCity: z.string().nullable(),
})

export type PublicEdition = z.infer<typeof publicEditionSchema>

/**
 * A row of the list of editions on the portal's home page: a published edition and its convention,
 * read across conventions (docs/adr/0043-list-every-published-edition-on-the-portals-home-page.md).
 * A field added here is public at once, for every convention.
 */
export const listedEditionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  startsAt: timestamp,
  endsAt: timestamp,
  venueCity: z.string().nullable(),
  tenant: z.object({
    slug: z.string(),
    name: z.string(),
    timezone: z.string(),
    logo: logoSchema.nullable(),
  }),
})

export type ListedEdition = z.infer<typeof listedEditionSchema>

/** The parts of the list: the editions that have not ended, and those that have. */
export const EDITION_LIST_PERIODS = ['coming', 'past'] as const

export type EditionListPeriod = (typeof EDITION_LIST_PERIODS)[number]

/** The rows of a page of the list, when the request names no size, and the most it may ask for. */
export const EDITION_LIST_PAGE = 20
export const MAX_EDITION_LIST_PAGE = 50

const PLACE = /^(-?\d{1,15})_(.+)$/

/**
 * The place in a part of the list a page continues from: the moment its last row is ordered by, to
 * the millisecond, and that row's identifier. The page names it and the next request gives it
 * back; the API compares with it and looks nothing up by it, so a place made up of an edition that
 * is not listed answers nothing of that edition.
 */
export const editionListPlace = {
  write: (moment: Date, id: string) => `${moment.getTime()}_${id}`,
  read(place: string): { moment: Date; id: string } | null {
    const match = PLACE.exec(place)
    if (!match || !z.uuid().safeParse(match[2]).success) return null
    return { moment: new Date(Number(match[1])), id: match[2]! }
  },
}

export const editionListQuerySchema = z.strictObject({
  period: z.enum(EDITION_LIST_PERIODS),
  /** The `next` of the page before. */
  after: z
    .string()
    .refine((place) => editionListPlace.read(place) !== null, 'Not a place in the list')
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_EDITION_LIST_PAGE).default(EDITION_LIST_PAGE),
})

/** A page of a part of the list, and the place the next one continues from; null after the last. */
export const editionListSchema = z.object({
  editions: z.array(listedEditionSchema),
  next: z.string().nullable(),
})

export type EditionList = z.infer<typeof editionListSchema>

/**
 * A speaker as the programme shows it to anyone: the parts of its public name and their order,
 * and the identifier of its profile while that is published (docs/specs/0016-public-profile.md,
 * N5 and P11). Never the account's own identifier or its email address.
 */
export const publicSpeakerSchema = z.object({
  firstName: z.string().nullable(),
  nickname: z.string().nullable(),
  lastName: z.string().nullable(),
  nameOrder: nameOrderSchema,
  profileId: z.uuid().nullable(),
})

export type PublicSpeaker = z.infer<typeof publicSpeakerSchema>

export const publicProgramItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: timestamp,
  endsAt: timestamp,
  speakers: z.array(publicSpeakerSchema),
  likeCount: z.number().int().nonnegative(),
})

export type PublicProgramItem = z.infer<typeof publicProgramItemSchema>

const tenant = z.object({ params: z.object({ slug: z.string() }) })
const edition = z.object({ params: z.object({ slug: z.string(), editionSlug: z.string() }) })
const programItem = z.object({
  params: z.object({ slug: z.string(), editionSlug: z.string(), programItemId: z.string() }),
})
const logoFile = z.object({
  params: z.object({ slug: z.string(), fileId: z.string(), variant: z.string() }),
})
const documentVersion = z.object({
  params: z.object({ slug: z.string(), versionId: z.string() }),
})
const merchandiseFile = z.object({
  params: z.object({ slug: z.string(), fileId: z.string(), variant: z.string() }),
})

const profile = z.object({ params: z.object({ profileId: z.string() }) })
const avatarFile = z.object({ params: z.object({ fileId: z.string(), variant: z.string() }) })

/** An order a public address names, opened by its result token alone. */
const order = z.object({
  params: z.object({ slug: z.string(), orderId: z.string() }),
  headers: resultTokenHeaders,
})

export const publicContract = {
  tenant: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}',
      summary: "A convention's name, language, time zone and logo; no sign-in",
    })
    .input(tenant)
    .output(publicTenantSchema),
  editionList: publicRoute
    .route({
      method: 'GET',
      path: '/public/editions',
      summary:
        'The published editions of every convention, the coming ones from the soonest or the past ones from the last ended, a page at a time; no sign-in',
    })
    .input(z.object({ query: editionListQuerySchema }))
    .output(editionListSchema),
  logoFile: publicRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/logo-files/{fileId}/{variant}',
      outputStructure: 'detailed',
      summary: "A variant of a convention's logo, as an image; no sign-in",
    })
    .input(logoFile)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
  documentVersion: publicRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/document-versions/{versionId}',
      outputStructure: 'detailed',
      summary:
        "A published version of a legal document of one of the convention's editions, as a download; no sign-in",
    })
    .input(documentVersion)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
  merchandiseFile: publicRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/merchandise-files/{fileId}/{variant}',
      outputStructure: 'detailed',
      summary:
        'A picture or a size chart of a merchandise item that is not hidden, of a published edition, in one of its sizes; no sign-in',
    })
    .input(merchandiseFile)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
  addOnFile: publicRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/add-on-files/{fileId}/{variant}',
      outputStructure: 'detailed',
      summary:
        'The picture of an add-on that is not hidden, of a published edition, in one of its sizes; no sign-in',
    })
    .input(merchandiseFile)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
  shop: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/editions/{editionSlug}/shop',
      summary:
        "The offer of a published edition's shop: what is on sale and at which price, what the checkout asks and links, the seller's details and what the payment provider's module requires; no sign-in",
    })
    .input(edition)
    .output(offerSchema),
  shopQuote: publicRoute
    .route({
      method: 'POST',
      path: '/public/tenants/{slug}/editions/{editionSlug}/shop/quote',
      summary:
        'The lines and the total of a cart, with the line of a discount code where one is given; refused with shop.closed, with order.unavailable naming what cannot be had, or with discount-code.refused; no sign-in',
    })
    .input(edition.extend({ body: quoteRequestSchema }))
    .output(quoteSchema),
  placeOrder: publicRoute
    .route({
      method: 'POST',
      path: '/public/tenants/{slug}/editions/{editionSlug}/shop/orders',
      successStatus: 201,
      summary:
        "Place a visitor's order; refused with shop.closed, order.unavailable naming what ran out, order.total-changed with the new total, order.consent-missing, order.email-refused, order.too-many-unpaid or bot-check.failed; no sign-in",
    })
    .input(edition.extend({ body: placeVisitorOrderSchema }))
    .output(placedOrderSchema),
  orderResult: publicRoute
    .route({
      method: 'GET',
      path: '/public/tenants/{slug}/orders/{orderId}/result',
      summary:
        "What the result page shows of an order: its status and number alone; by the order's result token, in a header; no sign-in",
    })
    .input(order)
    .output(orderResultSchema),
  startPaymentAttempt: publicRoute
    .route({
      method: 'POST',
      path: '/public/tenants/{slug}/orders/{orderId}/payment-attempts',
      successStatus: 201,
      summary:
        "Start a payment attempt for an order and answer where to send the buyer; by the order's result token, in a header; refused with order.hold-ended, order.already-paid or provider.unavailable; no sign-in",
    })
    .input(order.extend({ headers: attemptHeaders }))
    .output(startedAttemptSchema),
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
  profile: publicRoute
    .route({
      method: 'GET',
      path: '/public/profiles/{profileId}',
      summary:
        'A published profile: the public name of its account, its avatar and what it holds; a profile that is not published is not found; no sign-in',
    })
    .input(profile)
    .output(publicProfileSchema),
  avatarFile: publicRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/public/avatar-files/{fileId}/{variant}',
      outputStructure: 'detailed',
      summary:
        "A variant of an account's avatar, as an image, whether or not its profile is published; no sign-in",
    })
    .input(avatarFile)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
}
