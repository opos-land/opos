import { Controller, Inject } from '@nestjs/common'
import { contract, placeOrderSchema, priceCart, SHOP_CURRENCY } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { PublicConvention } from '../public/public-convention'
import { PublicRepository } from '../public/public.repository'
import { BOT_CHECK, type BotCheck } from './bot-check'
import { botCheckFailed, cartRefusal } from './checkout.errors'
import { OfferService } from './offer.service'
import { OrderPlacement } from './order-placement.service'

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

  /** A cart is priced against the offer as it stands now, by the function the portal runs too. */
  @Implement(contract.public.shopQuote)
  quote() {
    return implement(contract.public.shopQuote).handler(async ({ input }) => {
      await this.limiter.consume('shopQuotes', `ip:${this.context.clientAddress()}`)
      const offer = await this.offer(input.params.slug, input.params.editionSlug)
      const priced = priceCart(offer, input.body)
      if ('problem' in priced) throw cartRefusal(priced.problem)
      return { currency: SHOP_CURRENCY, ...priced }
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
      if (!(await this.botCheck.verify(input.body.botCheckToken, address))) throw botCheckFailed()
      // The address was typed twice and compared: what is left of the body is the order itself.
      const order = placeOrderSchema.parse(
        Object.fromEntries(
          Object.entries(input.body).filter(
            ([field]) => field !== 'email' && field !== 'emailConfirmation',
          ),
        ),
      )
      return this.convention.within(input.params.slug, async (tenant) => {
        const edition = await this.editions.edition(input.params.editionSlug)
        return this.placement.place(tenant.id, edition.id, order, { email: input.body.email })
      })
    })
  }
}
