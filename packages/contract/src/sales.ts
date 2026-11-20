import { z } from 'zod'
import { ADD_ON_KINDS } from './catalog'
import { tenantRoute } from './common'

// The reports of an edition's sales (docs/specs/0010-sales-reports.md). Each needs tickets read
// access to the edition, and reads that edition alone.

/**
 * How much of something orders hold (D3): `sold` by "Paid" and "Paid - manual" orders, `pending`
 * by orders awaiting payment and orders needing review. An expired, declined or canceled order
 * counts nowhere.
 */
const held = { sold: z.number().int().min(0), pending: z.number().int().min(0) }

/** The dashboard of an edition's sales, as the orders are when it is read (D1-D6). */
export const salesSchema = z.object({
  currency: z.string(),
  /** The totals of the "Paid" orders, and apart from them of the "Paid - manual" ones (D4). */
  revenue: z.object({ paidMinor: z.number().int().min(0), manualMinor: z.number().int().min(0) }),
  orders: z.object({
    paid: z.number().int().min(0),
    manual: z.number().int().min(0),
    awaitingPayment: z.number().int().min(0),
    needsReview: z.number().int().min(0),
  }),
  ticketTypes: z.array(z.object({ id: z.uuid(), name: z.string(), ...held })),
  /** Every add-on with its count, headcount-only ones among them. */
  addOns: z.array(
    z.object({ id: z.uuid(), name: z.string(), kind: z.enum(ADD_ON_KINDS), ...held }),
  ),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      variants: z.array(
        z.object({
          id: z.uuid(),
          /** The labels of the variant's values, in the order of its item's axes. */
          labels: z.array(z.string()),
          ...held,
        }),
      ),
    }),
  ),
  /** The ticket holders of the sold orders, by age band. */
  ageBands: z.object({
    child: z.number().int().min(0),
    teen: z.number().int().min(0),
    adult: z.number().int().min(0),
  }),
  /**
   * What was sold on each day (D6): the totals of the "Paid" orders paid that day, apart from
   * them those of the "Paid - manual" ones, and the tickets both hold. A day is one of the
   * convention's time zone; the earliest comes first, and a day nothing was sold on is left out.
   */
  days: z.array(
    z.object({
      day: z.iso.date(),
      paidMinor: z.number().int().min(0),
      manualMinor: z.number().int().min(0),
      tickets: z.number().int().min(0),
    }),
  ),
  /** The answers the sold orders gave to each custom field, the most frequent first (D5). */
  customFields: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      answers: z.array(z.object({ answer: z.string(), orders: z.number().int().min(1) })),
    }),
  ),
})

export type Sales = z.infer<typeof salesSchema>

const edition = z.object({ params: z.object({ editionId: z.string() }) })

/**
 * A list as a file: CSV, its columns in the language asked for in Accept-Language, which the
 * panel sends as the one it shows.
 */
const file = (path: `/${string}`, summary: string) =>
  tenantRoute
    .route({ method: 'GET', path, outputStructure: 'detailed', summary })
    .input(
      edition.extend({ headers: z.object({ 'accept-language': z.string().max(200).optional() }) }),
    )
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) }))

export const salesContract = {
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/sales',
      summary:
        "The dashboard of the edition's sales: revenue, what is sold and what is pending of each ticket type, add-on and variant, what was sold on each day, the ticket holders by age band and the answers to each custom field; needs tickets>=read",
    })
    .input(edition)
    .output(salesSchema),
  ticketHolders: file(
    '/editions/{editionId}/exports/ticket-holders',
    'The ticket holder list as a CSV file: a row an order with a ticket; needs tickets>=read',
  ),
  merchandisePickList: file(
    '/editions/{editionId}/exports/merchandise-pick-list',
    'The merchandise pick list as a CSV file: a row a merchandise line of a paid order; needs tickets>=read',
  ),
  payments: file(
    '/editions/{editionId}/exports/payments',
    "The payments list as a CSV file: a row a payment attempt, with what its provider's module keeps of it; needs tickets>=read",
  ),
}
