import { Injectable } from '@nestjs/common'
import {
  type Extending,
  priceCart,
  type Quote,
  type QuoteRequest,
  SHOP_CURRENCY,
} from '@opos/contract'
import { cartRefusal, discountCodeRefused } from './checkout.errors'
import { Discounts } from './discounts.service'
import { OfferService } from './offer.service'

/**
 * What a cart costs, as the shop tells a buyer before an order is placed
 * (docs/specs/0004-checkout-and-orders.md, docs/specs/0008-discount-codes.md). It runs in the
 * transaction of the tenant the request named.
 */
@Injectable()
export class Quotes {
  constructor(
    private readonly offers: OfferService,
    private readonly discounts: Discounts,
  ) {}

  /**
   * A cart is priced against the offer as it stands now, by the function the portal runs too. A
   * discount code is looked up here alone: its terms never leave the API, and the quote carries
   * what it takes off as a line. Every code that cannot be used is refused alike. With
   * `extending` the cart adds to a paid order, and is priced as that order is added to.
   */
  async of(
    tenantId: string,
    editionId: string,
    { discountCode, ...cart }: QuoteRequest,
    extending?: Extending,
  ): Promise<Quote> {
    const offer = await this.offers.of(tenantId, editionId)
    // What cannot be had of the cart is told first, as it is without a code.
    const plain = priceCart(offer, cart, undefined, extending)
    if ('problem' in plain) throw cartRefusal(plain.problem)
    if (discountCode === undefined) return { currency: SHOP_CURRENCY, ...plain }
    const code = await this.discounts.usable(editionId, discountCode, new Date())
    if (!code || !(await this.discounts.hasUse(editionId, code.id))) throw discountCodeRefused()
    const priced = priceCart(offer, cart, code, extending)
    if ('problem' in priced) {
      // The code applies to nothing in the cart.
      throw priced.problem.kind === 'discount-code'
        ? discountCodeRefused()
        : cartRefusal(priced.problem)
    }
    return { currency: SHOP_CURRENCY, ...priced }
  }
}
