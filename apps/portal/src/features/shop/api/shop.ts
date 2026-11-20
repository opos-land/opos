import {
  type Cart,
  type PlacedOrder,
  type PlaceOrder,
  type PlaceVisitorOrder,
  RESULT_TOKEN_HEADER,
  type StartedAttempt,
} from '@opos/contract'
import { accountApi, tenantApi } from '../../../shared/lib/api'

// The shop of an edition, as anyone reads it, and what a checkout asks of the API. A visitor's
// requests go to the addresses that need no sign-in; a signed-in buyer's go into the tenant, under
// the account's own email.

/** The convention the shop belongs to: its name and the time zone its dates are written in. */
export const conventionOptions = (slug: string) =>
  accountApi.public.tenant.queryOptions({ input: { params: { slug } } })

/** The published edition the shop sells for. */
export const editionOptions = (slug: string, editionSlug: string) =>
  accountApi.public.edition.queryOptions({ input: { params: { slug, editionSlug } } })

/** The offer of an edition's shop: everything its pages show. */
export const offerOptions = (slug: string, editionSlug: string) =>
  accountApi.public.shop.queryOptions({ input: { params: { slug, editionSlug } } })

export const offerKey = (slug: string, editionSlug: string) =>
  accountApi.public.shop.queryKey({ input: { params: { slug, editionSlug } } })

/**
 * The price of a cart with a discount code: only the API knows a code's terms, so the Summary
 * asks it. A code that cannot be used is refused with one answer, whatever is wrong with it.
 */
export const discountQuoteOptions = (
  slug: string,
  editionSlug: string,
  cart: Cart,
  discountCode: string,
) =>
  accountApi.public.shopQuote.queryOptions({
    input: { params: { slug, editionSlug }, body: { ...cart, discountCode } },
  })

/** Where the order of a checkout is placed: its edition, by both of its names. */
export interface PlacedIn {
  slug: string
  editionSlug: string
  editionId: string
}

/** Places the order of a checkout; a signed-in buyer's is the account's own. */
export function placeOrder(
  at: PlacedIn,
  body: PlaceOrder | PlaceVisitorOrder,
  signedIn: boolean,
): Promise<PlacedOrder> {
  if (signedIn) {
    return tenantApi(at.slug).checkout.placeOrder.call({
      params: { editionId: at.editionId },
      body,
    })
  }
  return accountApi.public.placeOrder.call({
    params: { slug: at.slug, editionSlug: at.editionSlug },
    body: body as PlaceVisitorOrder,
  })
}

const withToken = (token: string) => ({ [RESULT_TOKEN_HEADER]: token })

/**
 * Starts a payment attempt for the order and answers where to send the buyer. The result token
 * travels in a header; a signed-in buyer's own order needs none, and sends it for the way back.
 */
export function startPaymentAttempt(
  at: PlacedIn,
  orderId: string,
  token: string,
  signedIn: boolean,
): Promise<StartedAttempt> {
  if (signedIn) {
    return tenantApi(at.slug).checkout.startPaymentAttempt.call({
      params: { editionId: at.editionId, orderId },
      headers: withToken(token),
    })
  }
  return accountApi.public.startPaymentAttempt.call({
    params: { slug: at.slug, orderId },
    headers: withToken(token),
  })
}

/** The same for a buyer the result page holds only the token of. */
export const startPaymentAttemptByToken = (slug: string, orderId: string, token: string) =>
  accountApi.public.startPaymentAttempt.call({
    params: { slug, orderId },
    headers: withToken(token),
  })

/** What the result page shows of an order: its status and number alone. */
export const orderResultOptions = (slug: string, orderId: string, token: string) =>
  accountApi.public.orderResult.queryOptions({
    input: { params: { slug, orderId }, headers: withToken(token) },
  })
