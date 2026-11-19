import { z } from 'zod'
import { tenantRoute } from './common'
import { type FileType, uploadedFileSchema } from './files'

// What an edition sells and on what terms (docs/specs/0003-catalog.md): ticket types, add-ons,
// merchandise and the custom fields it asks a ticket holder for, behind the tickets permission of
// the edition. Every price is a gross amount in the convention's currency, in its minor unit.

/** The largest amount a price holds, in minor units: a million of the currency. */
export const MAX_AMOUNT_MINOR = 100_000_000

/** A price: a whole number of minor units, which may be zero. */
export const amountMinor = z.number().int().min(0).max(MAX_AMOUNT_MINOR)

/**
 * What one edition may hold of each kind: the shop's offer is one answer, sent to anyone who
 * asks.
 */
export const MAX_ADD_ONS = 50
export const MAX_CUSTOM_FIELDS = 20
export const MAX_MERCHANDISE_ITEMS = 200
export const MAX_ITEM_VARIANTS = 100
export const MAX_ITEM_PICTURES = 10
/** The most axes an item has, and the most values an axis. */
export const MAX_OPTION_AXES = 3
export const MAX_OPTION_VALUES = 30

/** A place in an ordered list, counted from 1; one past the end is the last. */
const position = z.number().int().positive()

const name = z.string().trim().min(1).max(100)

/**
 * What limits an add-on: nothing, a capacity, or nothing at all because it only counts interest
 * and reserves no place.
 */
export const ADD_ON_KINDS = ['unlimited', 'limited', 'headcount'] as const

export type AddOnKind = (typeof ADD_ON_KINDS)[number]

/** An add-on of an edition: an optional extra bought with a ticket. */
export const addOnSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  name: z.string(),
  description: z.string(),
  amountMinor: z.number().int(),
  kind: z.enum(ADD_ON_KINDS),
  /** The places a limited add-on has; null for the other kinds. */
  capacity: z.number().int().nullable(),
  /** Below this many places left the shop shows how many; null to never show them. */
  placesLeftThreshold: z.number().int().nullable(),
  position,
  /** Hidden from the shop; the orders that hold it keep it. */
  hidden: z.boolean(),
})

export type AddOn = z.infer<typeof addOnSchema>

const addOnFields = {
  name,
  description: z.string().trim().max(1000),
  amountMinor,
  kind: z.enum(ADD_ON_KINDS),
  capacity: z.number().int().min(0).max(1_000_000).nullable(),
  placesLeftThreshold: z.number().int().min(1).max(1_000_000).nullable(),
}

/** What an add-on's limit must hold together: a capacity for a limited one, and for no other. */
export interface AddOnLimit {
  kind: AddOnKind
  capacity?: number | null
  placesLeftThreshold?: number | null
}

/** The field of an add-on's limit that does not fit its kind, or none. */
export function addOnLimitIssue(addOn: AddOnLimit): 'capacity' | 'placesLeftThreshold' | undefined {
  const limited = addOn.kind === 'limited'
  if (limited !== (addOn.capacity != null)) return 'capacity'
  if (!limited && addOn.placesLeftThreshold != null) return 'placesLeftThreshold'
  return undefined
}

export const createAddOnSchema = z
  .strictObject(addOnFields)
  .partial({ description: true, capacity: true, placesLeftThreshold: true })
  .superRefine((addOn, context) => {
    const field = addOnLimitIssue(addOn)
    if (field) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'A limited add-on has a capacity, and no other kind has one or a threshold',
      })
    }
  })

export type CreateAddOn = z.infer<typeof createAddOnSchema>

/**
 * A change of an add-on. Whether its limit still holds together depends on the stored add-on, so
 * the API checks the outcome; a kind that is no longer limited lets go of its capacity and
 * threshold by itself.
 */
export const updateAddOnSchema = z
  .strictObject({ ...addOnFields, position, hidden: z.boolean() })
  .partial()

export type UpdateAddOn = z.infer<typeof updateAddOnSchema>

/**
 * A custom field of an edition: what it asks a ticket holder for, answered with a short text. It
 * must ask for nothing sensitive, which the panel says where a field is defined.
 */
export const customFieldSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  label: z.string(),
  isRequired: z.boolean(),
  position,
  /** No longer asked; the orders that answered it keep their answers. */
  hidden: z.boolean(),
})

export type CustomField = z.infer<typeof customFieldSchema>

/** The longest answer a custom field takes. */
export const MAX_CUSTOM_FIELD_ANSWER = 200

export const createCustomFieldSchema = z.strictObject({ label: name, isRequired: z.boolean() })

export type CreateCustomField = z.infer<typeof createCustomFieldSchema>

export const updateCustomFieldSchema = z
  .strictObject({ label: name, isRequired: z.boolean(), position, hidden: z.boolean() })
  .partial()

export type UpdateCustomField = z.infer<typeof updateCustomFieldSchema>

/** A picture and a size chart are images alone, among the types the storage keeps. */
export const MERCHANDISE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly FileType[]

/** The largest picture or size chart, in bytes. */
export const MAX_MERCHANDISE_IMAGE_SIZE = 5 * 1024 * 1024

/**
 * The sizes a picture and a size chart are served in: small in the shop's listing and the cart,
 * large on an item's page and for a size chart.
 */
export const MERCHANDISE_IMAGE_VARIANTS = ['small', 'large'] as const

export type MerchandiseImageVariant = (typeof MERCHANDISE_IMAGE_VARIANTS)[number]

/** The most a variant's stock holds. */
export const MAX_STOCK = 1_000_000

/**
 * An image of an item as a page shows it: the file its address names, and the width and height of
 * the picture, whose proportions every size keeps.
 */
const imageSchema = z.object({
  fileId: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export type MerchandiseImage = z.infer<typeof imageSchema>

/** A variant of an item: one value of each of its axes, with its own stock. */
export const merchandiseVariantSchema = z.object({
  id: z.uuid(),
  /** In the order of the item's axes; none for the one variant of an item without axes. */
  valueIds: z.array(z.uuid()),
  /** Null while the variant is unlimited, which sells until the pre-order deadline alone. */
  stock: z.number().int().nullable(),
  hidden: z.boolean(),
})

export type MerchandiseVariant = z.infer<typeof merchandiseVariantSchema>

/**
 * A merchandise item of an edition with its option axes, the variants that exist and its
 * pictures in their order. It is picked up at the edition: nothing here is for shipping.
 */
export const merchandiseItemSchema = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  name: z.string(),
  description: z.string(),
  amountMinor: z.number().int(),
  /** The most of it a single order may take, over all its variants. */
  perOrderLimit: z.number().int(),
  picturesIllustrative: z.boolean(),
  position,
  /** Hidden from the shop; the orders that hold it keep it. */
  hidden: z.boolean(),
  axes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      values: z.array(
        z.object({ id: z.uuid(), label: z.string(), sizeChart: imageSchema.nullable() }),
      ),
    }),
  ),
  variants: z.array(merchandiseVariantSchema),
  pictures: z.array(imageSchema.extend({ id: z.uuid() })),
})

export type MerchandiseItem = z.infer<typeof merchandiseItemSchema>

const optionName = z.string().trim().min(1).max(50)

/** Whether the texts are each of their own, whatever their case. */
const distinct = (texts: readonly string[]) =>
  new Set(texts.map((text) => text.toLowerCase())).size === texts.length

/**
 * The axes of an item as a whole list, in their order. An axis or a value that names its
 * identifier is the one the item has, renamed or moved; one without is new; one left out goes.
 */
const axesInput = <Id extends z.ZodType>(id: Id) =>
  z
    .array(
      z.strictObject({
        id,
        name: optionName,
        values: z
          .array(z.strictObject({ id, label: optionName }))
          .min(1)
          .max(MAX_OPTION_VALUES)
          .refine((values) => distinct(values.map((value) => value.label)), {
            message: 'A value is named once in its axis',
          }),
      }),
    )
    .max(MAX_OPTION_AXES)
    .refine((axes) => distinct(axes.map((axis) => axis.name)), {
      message: 'An axis is named once in its item',
    })

const merchandiseItemFields = {
  name,
  description: z.string().trim().max(5000),
  amountMinor,
  perOrderLimit: z.number().int().min(1).max(100),
  picturesIllustrative: z.boolean(),
}

export const createMerchandiseItemSchema = z
  .strictObject({ ...merchandiseItemFields, axes: axesInput(z.undefined().optional()) })
  .partial({ description: true, picturesIllustrative: true, axes: true })

export type CreateMerchandiseItem = z.infer<typeof createMerchandiseItemSchema>

/**
 * A change of an item. Once an axis is added or taken away no variant fits the axes any more, so
 * every variant goes; a value taken away takes the variants that held it.
 */
export const updateMerchandiseItemSchema = z
  .strictObject({
    ...merchandiseItemFields,
    position,
    hidden: z.boolean(),
    axes: axesInput(z.uuid().optional()),
    /** Every picture of the item, once each, in the order the shop shows them. */
    pictureIds: z.array(z.uuid()).max(MAX_ITEM_PICTURES),
  })
  .partial()

export type UpdateMerchandiseItem = z.infer<typeof updateMerchandiseItemSchema>

/**
 * The variants of an item that exist, as a whole list: each one value of each axis. One the item
 * already has keeps its stock; a new one is out of stock until an org enters a number; one left
 * out goes. The list may be longer than an item holds, which the API refuses by its own code.
 */
export const putVariantsSchema = z.strictObject({
  variants: z
    .array(
      z.strictObject({
        valueIds: z.array(z.uuid()).max(MAX_OPTION_AXES),
        hidden: z.boolean().optional(),
      }),
    )
    .max(MAX_OPTION_VALUES ** 2),
})

export type PutVariants = z.infer<typeof putVariantsSchema>

/** A variant's stock: a number an org entered, or null to mark it unlimited. */
export const putStockSchema = z.strictObject({
  stock: z.number().int().min(0).max(MAX_STOCK).nullable(),
})

export const merchandiseImageBodySchema = z.strictObject({ file: uploadedFileSchema })

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const addOn = z.object({ params: z.object({ editionId: z.string(), addOnId: z.string() }) })
const customField = z.object({ params: z.object({ editionId: z.string(), fieldId: z.string() }) })

export const addOnRoutes = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/add-ons',
      summary: "The edition's add-ons in their order, hidden ones too; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(addOnSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/add-ons',
      successStatus: 201,
      summary:
        'Add an add-on at the end of the list, up to the limit of an edition; needs tickets=write',
    })
    .input(edition.extend({ body: createAddOnSchema }))
    .output(addOnSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/add-ons/{addOnId}',
      summary:
        'Change an add-on, move it to a place of the list, hide it or show it; needs tickets=write',
    })
    .input(addOn.extend({ body: updateAddOnSchema }))
    .output(addOnSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/add-ons/{addOnId}',
      successStatus: 204,
      summary: 'Delete an add-on; needs tickets=write',
    })
    .input(addOn),
}

export const customFieldRoutes = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/custom-fields',
      summary: "The edition's custom fields in their order, hidden ones too; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(customFieldSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/custom-fields',
      successStatus: 201,
      summary:
        'Add a custom field at the end of the list, up to the limit of an edition; needs tickets=write',
    })
    .input(edition.extend({ body: createCustomFieldSchema }))
    .output(customFieldSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/custom-fields/{fieldId}',
      summary:
        'Change a custom field, move it to a place of the list, hide it or show it; needs tickets=write',
    })
    .input(customField.extend({ body: updateCustomFieldSchema }))
    .output(customFieldSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/custom-fields/{fieldId}',
      successStatus: 204,
      summary: 'Delete a custom field; needs tickets=write',
    })
    .input(customField),
}

const item = z.object({ params: z.object({ editionId: z.string(), itemId: z.string() }) })
const variant = z.object({
  params: z.object({ editionId: z.string(), itemId: z.string(), variantId: z.string() }),
})
const picture = z.object({
  params: z.object({ editionId: z.string(), itemId: z.string(), pictureId: z.string() }),
})
const optionValue = z.object({
  params: z.object({ editionId: z.string(), itemId: z.string(), valueId: z.string() }),
})
const merchandiseFile = z.object({
  params: z.object({ editionId: z.string(), fileId: z.string(), variant: z.string() }),
})

export const merchandiseRoutes = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/merchandise-items',
      summary:
        "The edition's merchandise items in their order with their axes, variants and pictures, hidden ones too; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(merchandiseItemSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/merchandise-items',
      successStatus: 201,
      summary:
        'Add a merchandise item at the end of the list, up to the limit of an edition; needs tickets=write',
    })
    .input(edition.extend({ body: createMerchandiseItemSchema }))
    .output(merchandiseItemSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/merchandise-items/{itemId}',
      summary:
        'Change an item, its axes and the order of its pictures, move it to a place of the list, hide it or show it; needs tickets=write',
    })
    .input(item.extend({ body: updateMerchandiseItemSchema }))
    .output(merchandiseItemSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/merchandise-items/{itemId}',
      successStatus: 204,
      summary: 'Delete an item with its variants, pictures and size charts; needs tickets=write',
    })
    .input(item),
  putVariants: tenantRoute
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/merchandise-items/{itemId}/variants',
      summary:
        'Set the variants of an item that exist, up to the limit of an item; needs tickets=write',
    })
    .input(item.extend({ body: putVariantsSchema }))
    .output(merchandiseItemSchema),
  putStock: tenantRoute
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/merchandise-items/{itemId}/variants/{variantId}/stock',
      summary: "Set a variant's stock, or mark it unlimited; needs tickets=write",
    })
    .input(variant.extend({ body: putStockSchema }))
    .output(merchandiseItemSchema),
  addPicture: tenantRoute
    .meta({ takesFile: true })
    .route({
      method: 'POST',
      path: '/editions/{editionId}/merchandise-items/{itemId}/pictures',
      successStatus: 201,
      summary:
        'Add an image as the last picture of an item, up to the limit of an item; needs tickets=write',
    })
    .input(item.extend({ body: merchandiseImageBodySchema }))
    .output(merchandiseItemSchema),
  removePicture: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/merchandise-items/{itemId}/pictures/{pictureId}',
      successStatus: 204,
      summary: 'Remove a picture of an item, its file with it; needs tickets=write',
    })
    .input(picture),
  putSizeChart: tenantRoute
    .meta({ takesFile: true })
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/merchandise-items/{itemId}/option-values/{valueId}/size-chart',
      summary:
        'Set an image as the size chart of a value, in place of the one it had; needs tickets=write',
    })
    .input(optionValue.extend({ body: merchandiseImageBodySchema }))
    .output(merchandiseItemSchema),
  removeSizeChart: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/merchandise-items/{itemId}/option-values/{valueId}/size-chart',
      successStatus: 204,
      summary: 'Remove the size chart of a value, its file with it; needs tickets=write',
    })
    .input(optionValue),
  file: tenantRoute
    .meta({ servesFile: true })
    .route({
      method: 'GET',
      path: '/editions/{editionId}/merchandise-files/{fileId}/{variant}',
      outputStructure: 'detailed',
      summary:
        "A picture or a size chart of the edition's merchandise in one of its sizes, of a hidden item too; needs tickets>=read",
    })
    .input(merchandiseFile)
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
}

export const catalogContract = {
  addOns: addOnRoutes,
  customFields: customFieldRoutes,
  merchandise: merchandiseRoutes,
}
