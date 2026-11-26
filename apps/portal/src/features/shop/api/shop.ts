import {
  type Cart,
  type PlacedOrder,
  type PlaceOrder,
  type PlaceVisitorOrder,
  type Quote,
  RESULT_TOKEN_HEADER,
  type StartedAttempt,
} from '@opos/contract'
import { queryOptions } from '@tanstack/react-query'
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

/** Where the order of a checkout is placed: its edition, by both of its names. */
export interface PlacedIn {
  slug: string
  editionSlug: string
  editionId: string
}

/**
 * The price of a cart with a discount code: only the API knows a code's terms, so the Summary
 * asks it. A code that cannot be used is refused with one answer, whatever is wrong with it. A
 * "Buy more" cart is priced as an addition to the account's own order it names, which the quote
 * for anyone cannot do: it is asked of the account's quote, in the tenant.
 */
export const discountQuoteOptions = (
  at: PlacedIn,
  cart: Cart,
  discountCode: string,
  extendsOrderId?: string,
) =>
  queryOptions<Quote>(
    extendsOrderId === undefined
      ? accountApi.public.shopQuote.queryOptions({
          input: {
            params: { slug: at.slug, editionSlug: at.editionSlug },
            body: { ...cart, discountCode },
          },
        })
      : tenantApi(at.slug).checkout.quote.queryOptions({
          input: {
            params: { editionId: at.editionId },
            body: { ...cart, discountCode, extendsOrderId },
          },
        }),
  )

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

/**
 * What an order link opens (docs/specs/0009-buyer-self-service.md): the token travels in the
 * body, never in an address of the API.
 */
export const openOrderLink = (token: string) => accountApi.orderLinks.open.call({ body: { token } })

/** Asks for a fresh link to the order's email; the answer is the same for any token. */
export const renewOrderLink = (token: string) =>
  accountApi.orderLinks.renew.call({ body: { token } })

/** The signed-in account's own orders in the convention, the newest first. */
export const myOrdersOptions = (slug: string) => tenantApi(slug).myOrders.list.queryOptions()

/** "Resend QR code": the confirmation of the account's own paid order again. */
export const resendConfirmation = (slug: string, orderId: string) =>
  tenantApi(slug).myOrders.resendConfirmation.call({ params: { orderId } })

/**
 * "Pay now": a new payment attempt for the account's own unpaid order. No result token travels
 * with it, so the provider sends the buyer back to the convention's page.
 */
export const payNow = (slug: string, editionId: string, orderId: string) =>
  tenantApi(slug).checkout.startPaymentAttempt.call({
    params: { editionId, orderId },
    headers: {},
  })
