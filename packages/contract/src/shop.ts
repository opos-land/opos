import { z } from 'zod'
import { tenantRoute, timestamp } from './common'

// What a convention sets before an edition sells anything (docs/specs/0002-shop-setup.md): the
// seller's details and the convention's own payment provider account, behind the shop permission.

/** The payment providers OPOS has a module of; the fake one is loaded on local and dev alone. */
export const PAYMENT_PROVIDERS = ['fake', 'przelewy24'] as const

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

/** A part of the seller's details: text when given, null to clear it, never an empty text. */
const part = (max: number) => z.string().trim().min(1).max(max).nullable()

/**
 * The seller's details: the legal entity that runs the convention and sells its tickets, and the
 * address a buyer writes to. They are complete once every part is set.
 */
export const putSellerSchema = z.strictObject({
  sellerName: part(200),
  sellerAddress: part(500),
  sellerRegistrationNumber: part(50),
  contactEmail: z.email().max(254).nullable(),
})

export type SellerDetails = z.infer<typeof putSellerSchema>

export const sellerSchema = z.object({
  sellerName: z.string().nullable(),
  sellerAddress: z.string().nullable(),
  sellerRegistrationNumber: z.string().nullable(),
  contactEmail: z.string().nullable(),
  /** The one currency the convention sells in. */
  currency: z.literal('PLN'),
  complete: z.boolean(),
})

export type Seller = z.infer<typeof sellerSchema>

/** The most fields a provider's credentials have, and the longest a name and a value may be. */
const MAX_CREDENTIAL_FIELDS = 20

/**
 * The credentials of the convention's own account, as the fields its provider's module asks for.
 * They are checked with the provider, sealed and never answered again.
 */
export const putProviderAccountSchema = z.strictObject({
  provider: z.enum(PAYMENT_PROVIDERS),
  credentials: z.record(z.string().min(1).max(50), z.string().min(1).max(500)).refine(
    (fields) => {
      const count = Object.keys(fields).length
      return count >= 1 && count <= MAX_CREDENTIAL_FIELDS
    },
    { message: `Between 1 and ${MAX_CREDENTIAL_FIELDS} fields` },
  ),
})

/**
 * A connected account as the panel shows it: its provider, when it was connected, whether it is
 * ready to sell, and the conditions its provider's module names as missing while it is not.
 */
export const providerAccountSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  connectedAt: timestamp,
  ready: z.boolean(),
  missing: z.array(z.string()),
})

export type ProviderAccount = z.infer<typeof providerAccountSchema>

/** The convention's account, or none while it has connected none. */
export const providerAccountStateSchema = z.object({ account: providerAccountSchema.nullable() })

export const shopContract = {
  seller: {
    get: tenantRoute
      .route({
        method: 'GET',
        path: '/shop/seller',
        summary: "The seller's details of the convention; needs shop>=read",
      })
      .output(sellerSchema),
    put: tenantRoute
      .route({
        method: 'PUT',
        path: '/shop/seller',
        summary:
          "Set the seller's details; needs shop=write, and they stay complete while a shop of the convention is open",
      })
      .input(z.object({ body: putSellerSchema }))
      .output(sellerSchema),
  },
  providerAccount: {
    get: tenantRoute
      .route({
        method: 'GET',
        path: '/shop/provider-account',
        summary:
          "The convention's payment provider account, without its credentials; needs shop>=read",
      })
      .output(providerAccountStateSchema),
    put: tenantRoute
      .route({
        method: 'PUT',
        path: '/shop/provider-account',
        summary:
          "Connect the convention's own payment provider account, in place of the one it had: the credentials are checked with the provider first; needs shop=write",
      })
      .input(z.object({ body: putProviderAccountSchema }))
      .output(providerAccountStateSchema),
    remove: tenantRoute.route({
      method: 'DELETE',
      path: '/shop/provider-account',
      successStatus: 204,
      summary:
        'Disconnect the payment provider account and remove its credentials, while no shop of the convention is open; needs shop=write',
    }),
  },
}
