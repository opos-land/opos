import { type APIRequestContext, expect } from '@playwright/test'
import { BOT_CHECK_STAND_IN, type Offer, type PlacedOrder } from '@opos/contract'
import { type Accounts } from './index'
import { stack } from './stack'
import { type TenantFactory } from './tenants'

// A convention that sells, and orders placed and paid as the shop's page does it: what the
// scenarios of the panel's order screens and of the scanner start from.

/** A convention whose coming edition sells, and its head, who manages the orders. */
export async function selling(tenants: TenantFactory, accounts: Accounts) {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, defaultLocale: 'en' })
  const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
  const catalog = await tenants.sellingShop(tenant.id, edition.id)
  const shop = `${stack.api}/public/tenants/${tenant.slug}/editions/${edition.slug}/shop`
  return { head, tenant, edition, catalog, shop }
}

export type Selling = Awaited<ReturnType<typeof selling>>

/** The T-shirt's variant in M. */
export const shirtM = (s: Selling) => s.catalog.shirtVariants.M!

/**
 * A visitor's order as the shop's page would place it: a ticket, with a T-shirt in M when asked,
 * awaiting its payment. Answers the order and the address its buyer pays at.
 */
export async function buy(
  request: APIRequestContext,
  s: Selling,
  { email, shirt = false }: { email: string; shirt?: boolean },
) {
  const offer = (await (await request.get(s.shop)).json()) as Offer
  const placed = await request.post(`${s.shop}/orders`, {
    data: {
      cart: {
        ticket: { ticketTypeId: s.catalog.ticketTypeId },
        items: shirt ? [{ variantId: shirtM(s), quantity: 1 }] : [],
      },
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      email,
      emailConfirmation: email,
      customFieldAnswers: offer.customFields.map((field) => ({
        fieldId: field.id,
        answer: 'Poznań',
      })),
      consentIds: offer.consents.map((consent) => consent.id),
      providerConsentAccepted: true,
      expectedTotalMinor: 12000 + (shirt ? 8000 : 0),
      botCheckToken: BOT_CHECK_STAND_IN,
    },
  })
  expect(placed.status()).toBe(201)
  const order = (await placed.json()) as PlacedOrder
  const started = await request.post(
    `${stack.api}/public/tenants/${s.tenant.slug}/orders/${order.orderId}/payment-attempts`,
    { headers: { 'x-result-token': order.resultToken } },
  )
  expect(started.status()).toBe(201)
  const { redirectUrl } = (await started.json()) as { redirectUrl: string }
  return { ...order, payUrl: redirectUrl }
}

/** The buyer pays at the fake provider, which tells the API before it sends the buyer back. */
export const pay = (request: APIRequestContext, order: { payUrl: string }) =>
  request.get(`${order.payUrl}/paid`, { maxRedirects: 0 })
