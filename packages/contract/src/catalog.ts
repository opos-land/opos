import { z } from 'zod'
import { tenantRoute } from './common'

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

export const catalogContract = {
  addOns: addOnRoutes,
  customFields: customFieldRoutes,
}
