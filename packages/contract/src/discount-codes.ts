import { z } from 'zod'
import { tenantRoute, timestamp } from './common'

// The discount codes an org sets for an edition (docs/specs/0008-discount-codes.md). Reading them
// needs tickets read access to the edition, setting them write access.

/** The most ticket types, add-ons or items one code names. */
const MAX_APPLIES_TO = 200

/** A code as an org writes it: 4 to 40 letters, digits and hyphens, kept in lower case. */
const codeText = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{4,40}$/)

const ids = z.array(z.uuid()).max(MAX_APPLIES_TO)

/** A discount code as the panel lists it, with the uses orders hold of it against its limit. */
export const discountCodeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(['percent', 'amount']),
  percent: z.number().int().nullable(),
  amountMinor: z.number().int().nullable(),
  /** How many orders may hold the code at a time; null for no limit. */
  usageLimit: z.number().int().nullable(),
  /** The orders that hold a use now: an order that expired or was canceled has let go of its. */
  uses: z.number().int().min(0),
  validFrom: timestamp,
  validUntil: timestamp,
  /** Whether an org stopped the code before its window did. */
  ended: z.boolean(),
  ticketTypeIds: z.array(z.uuid()),
  addOnIds: z.array(z.uuid()),
  itemIds: z.array(z.uuid()),
})

export type DiscountCode = z.infer<typeof discountCodeSchema>

const fields = {
  code: codeText,
  kind: z.enum(['percent', 'amount']),
  percent: z.number().int().min(1).max(100).optional(),
  amountMinor: z.number().int().min(1).max(100_000_000).optional(),
  usageLimit: z.number().int().min(1).nullable(),
  validFrom: timestamp,
  validUntil: timestamp,
  ticketTypeIds: ids,
  addOnIds: ids,
  itemIds: ids,
}

/** Which of its two values a code of the kind has: a field of the form, or undefined. */
export function discountValueIssue(code: {
  kind: 'percent' | 'amount'
  percent?: number | null
  amountMinor?: number | null
}): 'percent' | 'amountMinor' | undefined {
  const has = (value: number | null | undefined) => value !== undefined && value !== null
  if (code.kind === 'percent') {
    return !has(code.percent) ? 'percent' : has(code.amountMinor) ? 'amountMinor' : undefined
  }
  return !has(code.amountMinor) ? 'amountMinor' : has(code.percent) ? 'percent' : undefined
}

export const createDiscountCodeSchema = z
  .strictObject({
    ...fields,
    usageLimit: fields.usageLimit.default(null),
    ticketTypeIds: ids.default([]),
    addOnIds: ids.default([]),
    itemIds: ids.default([]),
  })
  .superRefine((code, ctx) => {
    const field = discountValueIssue(code)
    if (field) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'A percent code has a percent and an amount code an amount, never both',
      })
    }
    if (Date.parse(code.validUntil) <= Date.parse(code.validFrom)) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'The window ends after it starts',
      })
    }
    if (code.ticketTypeIds.length + code.addOnIds.length + code.itemIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ticketTypeIds'],
        message: 'A code applies to something',
      })
    }
  })

export type CreateDiscountCode = z.infer<typeof createDiscountCodeSchema>

/**
 * A change of a code: any of its terms, and `ended` to stop it or let it run again. What the
 * change leaves of its value and its window is judged with what the code holds.
 */
export const updateDiscountCodeSchema = z.strictObject({
  code: fields.code.optional(),
  kind: fields.kind.optional(),
  percent: fields.percent.nullable(),
  amountMinor: fields.amountMinor.nullable(),
  usageLimit: fields.usageLimit.optional(),
  validFrom: timestamp.optional(),
  validUntil: timestamp.optional(),
  ticketTypeIds: ids.optional(),
  addOnIds: ids.optional(),
  itemIds: ids.optional(),
  ended: z.boolean().optional(),
})

export type UpdateDiscountCode = z.infer<typeof updateDiscountCodeSchema>

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const code = z.object({ params: z.object({ editionId: z.string(), codeId: z.string() }) })

export const discountCodesContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/discount-codes',
      summary:
        "The edition's discount codes by their text, each with the uses orders hold against its limit; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(discountCodeSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/discount-codes',
      successStatus: 201,
      summary: 'Set a discount code; refused with discount-code.taken; needs tickets=write',
    })
    .input(edition.extend({ body: createDiscountCodeSchema }))
    .output(discountCodeSchema),
  update: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/discount-codes/{codeId}',
      summary:
        'Change a discount code, end it or let it run again; refused with discount-code.taken, or with catalog.below-held for a limit below the uses orders hold; needs tickets=write',
    })
    .input(code.extend({ body: updateDiscountCodeSchema }))
    .output(discountCodeSchema),
  remove: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/discount-codes/{codeId}',
      successStatus: 204,
      summary:
        'Delete a discount code no order used; refused with discount-code.in-use for one an order did; needs tickets=write',
    })
    .input(code),
}
