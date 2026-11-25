import { Controller, Inject } from '@nestjs/common'
import { contract, placeOrderSchema } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { PublicConvention } from '../public/public-convention'
import { PublicRepository } from '../public/public.repository'
import { BOT_CHECK, type BotCheck } from './bot-check'
import {
  botCheckFailed,
  quoteRefusedForDiscountCode,
  refusedForDiscountCode,
} from './checkout.errors'
import { OfferService } from './offer.service'
import { OrderPlacement } from './order-placement.service'
import { Quotes } from './quotes.service'

/**
 * The shop of an edition for anyone (docs/specs/0004-checkout-and-orders.md): its offer and the
 * price of a cart. Without sign-in and without X-Tenant-Slug: the address names the convention
 * and the edition, and only a published edition of a convention that is not suspended answers.
 */
@Controller()
export class ShopPublicController {
  constructor(
    private readonly convention: PublicConvention,
    private readonly editions: PublicRepository,
    private readonly offers: OfferService,
    private readonly placement: OrderPlacement,
    private readonly quotes: Quotes,
    @Inject(BOT_CHECK) private readonly botCheck: BotCheck,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  /** The offer of the published edition the address names, read in its tenant. */
  private offer(slug: string, editionSlug: string) {
    return this.convention.within(slug, async (tenant) => {
      const edition = await this.editions.edition(editionSlug)
      return this.offers.of(tenant.id, edition.id)
    })
  }

  @Implement(contract.public.shop)
  shop() {
    return implement(contract.public.shop).handler(({ input }) =>
      this.offer(input.params.slug, input.params.editionSlug),
    )
  }

  /** The price of anyone's cart, with the discount code the buyer entered. */
  @Implement(contract.public.shopQuote)
  quote() {
    return implement(contract.public.shopQuote).handler(async ({ input }) => {
      const address = this.context.clientAddress()
      await this.limiter.consume('shopQuotes', `ip:${address}`)
      const price = () =>
        this.convention.within(input.params.slug, async (tenant) => {
          const edition = await this.editions.edition(input.params.editionSlug)
          return this.quotes.of(tenant.id, edition.id, input.body)
        })
      if (input.body.discountCode === undefined) return price()
      // A code that is refused is a try of one, counted with an order's; one that can be used
      // is none. An address out of tries is refused before its code is looked at, and quotes
      // sent together are counted as those sent one by one.
      return this.limiter.counting(
        'discountCodeTries',
        `ip:${address}`,
        price,
        quoteRefusedForDiscountCode,
      )
    })
  }

  /**
   * A visitor's order, under an email typed twice. The bot check is verified first, outside every
   * transaction; the order is then placed in one transaction of the tenant the address named.
   */
  @Implement(contract.public.placeOrder)
  placeOrder() {
    return implement(contract.public.placeOrder).handler(async ({ input }) => {
      const address = this.context.clientAddress()
      await this.limiter.consume('orderPlacements', `ip:${address}`)
      // An address out of tries of a discount code is refused before its code is looked at.
      if (input.body.discountCode !== undefined) {
        this.limiter.check('discountCodeTries', `ip:${address}`)
      }
      if (!(await this.botCheck.verify(input.body.botCheckToken, address))) throw botCheckFailed()
      // The address was typed twice and compared: what is left of the body is the order itself.
      const order = placeOrderSchema.parse(
        Object.fromEntries(
          Object.entries(input.body).filter(
            ([field]) => field !== 'email' && field !== 'emailConfirmation',
          ),
        ),
      )
      const place = () =>
        this.convention.within(input.params.slug, async (tenant) => {
          const edition = await this.editions.edition(input.params.editionSlug)
          return this.placement.place(tenant.id, edition.id, order, { email: input.body.email })
        })
      if (order.discountCode === undefined) return place()
      // A code that cannot be used is a try of one, counted with a quote's; one used is none.
      // Orders sent together are counted as those sent one by one.
      return this.limiter.counting(
        'discountCodeTries',
        `ip:${address}`,
        place,
        refusedForDiscountCode,
      )
    })
  }
}
