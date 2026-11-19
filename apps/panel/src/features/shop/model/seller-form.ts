import { type Seller, type SellerDetails } from '@opos/contract'
import { z } from 'zod'

/**
 * The seller's details as the form holds them: a part that is not set is an empty field. The
 * limits are the API's, checked here so that a refusal is told beside its field.
 */
export const sellerFormSchema = z.object({
  sellerName: z.string().trim().max(200),
  sellerAddress: z.string().trim().max(500),
  sellerRegistrationNumber: z.string().trim().max(50),
  contactEmail: z.union([z.literal(''), z.email().max(254)]),
})

export type SellerValues = z.infer<typeof sellerFormSchema>

const FIELDS = ['sellerName', 'sellerAddress', 'sellerRegistrationNumber', 'contactEmail'] as const

export const sellerValues = (seller: Seller): SellerValues => ({
  sellerName: seller.sellerName ?? '',
  sellerAddress: seller.sellerAddress ?? '',
  sellerRegistrationNumber: seller.sellerRegistrationNumber ?? '',
  contactEmail: seller.contactEmail ?? '',
})

/** The details as the route takes them: every part, an emptied one as null. */
export const sellerBody = (values: SellerValues): SellerDetails =>
  Object.fromEntries(FIELDS.map((field) => [field, values[field].trim() || null])) as SellerDetails
