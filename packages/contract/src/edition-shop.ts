import { z } from 'zod'
import { tenantRoute, timestamp } from './common'
import { type FileType, uploadedFileSchema } from './files'

// What an edition sets before it sells anything (docs/specs/0002-shop-setup.md): its shop, its
// legal documents with their versions, and its consents, behind the tickets permission of the
// edition.

/**
 * What opening the shop of an edition asks for: the convention's provider account ready to sell,
 * its seller's details complete, and a published version of the edition's shop terms and of its
 * privacy policy.
 */
export const SHOP_CONDITIONS = [
  'provider-account',
  'seller-details',
  'shop-terms',
  'privacy-policy',
] as const

export type ShopCondition = (typeof SHOP_CONDITIONS)[number]

/**
 * The shop of an edition: whether it is open, and each condition of opening as met or missing.
 * That yes or no is all it says of the convention's provider account and seller's details, which
 * stay behind the shop permission.
 */
export const editionShopSchema = z.object({
  open: z.boolean(),
  openedAt: timestamp.nullable(),
  faqUrl: z.string().nullable(),
  conditions: z.object({
    'provider-account': z.boolean(),
    'seller-details': z.boolean(),
    'shop-terms': z.boolean(),
    'privacy-policy': z.boolean(),
  } satisfies Record<ShopCondition, z.ZodBoolean>),
})

export type EditionShop = z.infer<typeof editionShopSchema>

/** The address of the edition's FAQ, which the shop's footer links: a page on the web, or none. */
export const updateEditionShopSchema = z
  .strictObject({ faqUrl: z.httpUrl().max(2000).nullable() })
  .partial()

export type UpdateEditionShop = z.infer<typeof updateEditionShopSchema>

/** What a legal document is; opening the shop asks for the first two. */
export const DOCUMENT_KINDS = ['shop-terms', 'privacy-policy', 'edition-rules', 'other'] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

/** The kinds a shop cannot open without. */
export const REQUIRED_DOCUMENT_KINDS = [
  'shop-terms',
  'privacy-policy',
] as const satisfies readonly DocumentKind[]

/** A version is taken as a PDF alone, among the types the storage keeps. */
export const DOCUMENT_TYPES = ['application/pdf'] as const satisfies readonly FileType[]

/** The largest version, in bytes. */
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

/** What one edition may hold: its shop answers them all at once, to anyone who asks. */
export const MAX_EDITION_DOCUMENTS = 30
export const MAX_DOCUMENT_VERSIONS = 50
export const MAX_EDITION_CONSENTS = 20

/** A version of a document: a file published once and never changed, numbered within its document. */
export const documentVersionSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  publishedAt: timestamp,
  file: z.object({ name: z.string(), size: z.number().int().positive() }),
})

export type DocumentVersion = z.infer<typeof documentVersionSchema>

/** A legal document of an edition with its versions, the newest first. */
export const documentSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string(),
  /** Hidden from the shop; the orders that accepted it keep it. */
  hidden: z.boolean(),
  versions: z.array(documentVersionSchema),
})

export type EditionDocument = z.infer<typeof documentSchema>

const title = z.string().trim().min(1).max(200)

export const createDocumentSchema = z.strictObject({ kind: z.enum(DOCUMENT_KINDS), title })

/** A document keeps its kind: what changes is its title and whether the shop shows it. */
export const updateDocumentSchema = z.strictObject({ title, hidden: z.boolean() }).partial()

export type UpdateDocument = z.infer<typeof updateDocumentSchema>

export const publishVersionSchema = z.strictObject({ file: uploadedFileSchema })

/**
 * A consent of an edition: the sentence a buyer accepts, the document it links when it links one,
 * whether the buyer must accept it, and its place in the list, counted from 1.
 */
export const consentSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  documentId: z.uuid().nullable(),
  text: z.string(),
  isRequired: z.boolean(),
  position: z.number().int().positive(),
  /** Hidden from the shop; the orders that accepted it keep it. */
  hidden: z.boolean(),
})

export type Consent = z.infer<typeof consentSchema>

const sentence = z.string().trim().min(1).max(1000)

/** A new consent takes the last place of the list. */
export const createConsentSchema = z.strictObject({
  text: sentence,
  isRequired: z.boolean(),
  documentId: z.uuid().nullable().optional(),
})

export type CreateConsent = z.infer<typeof createConsentSchema>

/** A place past the end is the last one; the others make room in their order. */
export const updateConsentSchema = z
  .strictObject({
    text: sentence,
    isRequired: z.boolean(),
    documentId: z.uuid().nullable(),
    position: z.number().int().positive(),
    hidden: z.boolean(),
  })
  .partial()

export type UpdateConsent = z.infer<typeof updateConsentSchema>

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const document = z.object({ params: z.object({ editionId: z.string(), documentId: z.string() }) })
const consent = z.object({ params: z.object({ editionId: z.string(), consentId: z.string() }) })

export const editionShopRoutes = {
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/shop',
      summary:
        "The edition's shop: whether it is open and each condition of opening as met or missing; needs tickets>=read",
    })
    .input(edition)
    .output(editionShopSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/shop',
      summary: "Set the address of the edition's FAQ; needs tickets=write",
    })
    .input(edition.extend({ body: updateEditionShopSchema }))
    .output(editionShopSchema),
  open: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/shop/open',
      summary:
        "Open the edition's shop; refused with shop.not-ready, its params naming every condition that is missing; needs tickets=write",
    })
    .input(edition)
    .output(editionShopSchema),
  close: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/shop/close',
      summary: "Close the edition's shop, which stops new orders alone; needs tickets=write",
    })
    .input(edition)
    .output(editionShopSchema),
}

export const documentRoutes = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/documents',
      summary:
        "The edition's legal documents with their versions, hidden ones too; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(documentSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/documents',
      successStatus: 201,
      summary: 'Add a legal document, up to the limit of an edition; needs tickets=write',
    })
    .input(edition.extend({ body: createDocumentSchema }))
    .output(documentSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/documents/{documentId}',
      summary:
        "Change a document's title, hide it or show it; a document the open shop needs is not hidden; needs tickets=write",
    })
    .input(document.extend({ body: updateDocumentSchema }))
    .output(documentSchema),
  publishVersion: tenantRoute
    .meta({ takesFile: true })
    .route({
      method: 'POST',
      path: '/editions/{editionId}/documents/{documentId}/versions',
      successStatus: 201,
      summary:
        'Publish a PDF as the next version of a document, never changed afterwards; needs tickets=write',
    })
    .input(document.extend({ body: publishVersionSchema }))
    .output(documentSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/documents/{documentId}',
      successStatus: 204,
      summary:
        'Delete a document with its versions, unless a consent links it or the open shop needs it; needs tickets=write',
    })
    .input(document),
}

export const consentRoutes = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/consents',
      summary: "The edition's consents in their order, hidden ones too; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(consentSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/consents',
      successStatus: 201,
      summary:
        'Add a consent at the end of the list, up to the limit of an edition; needs tickets=write',
    })
    .input(edition.extend({ body: createConsentSchema }))
    .output(consentSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/consents/{consentId}',
      summary:
        'Change a consent, move it to a place of the list, hide it or show it; needs tickets=write',
    })
    .input(consent.extend({ body: updateConsentSchema }))
    .output(consentSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/consents/{consentId}',
      successStatus: 204,
      summary: 'Delete a consent; needs tickets=write',
    })
    .input(consent),
}
