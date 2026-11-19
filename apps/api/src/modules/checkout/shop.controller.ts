import { Controller } from '@nestjs/common'
import { contract, priceCart, SHOP_CURRENCY } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { PublicConvention } from '../public/public-convention'
import { PublicRepository } from '../public/public.repository'
import { cartRefusal } from './checkout.errors'
import { OfferService } from './offer.service'

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
}
