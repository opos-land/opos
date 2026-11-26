import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { OrderLinks, opensNothing } from './order-links.service'

/**
 * The routes of an order link (docs/specs/0009-buyer-self-service.md), open to anyone who holds
 * the token. It travels in the body, so no address of the API carries it, and each route has a
 * rate limit of its own: for the client's address, and for the link itself once its token opens
 * its order.
 */
@Controller()
export class OrderLinksController {
  constructor(
    private readonly links: OrderLinks,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.orderLinks.open)
  open() {
    // A token that opens nothing proves nothing, and is counted against the address it came
    // from: one out of those is refused before a token is looked up. A token that opens its
    // order is counted against itself, where it is found.
    return implement(contract.orderLinks.open).handler(({ input }) =>
      this.limiter.counting(
        'orderLinkOpens',
        `ip:${this.context.clientAddress()}`,
        () => this.links.open(input.body.token),
        opensNothing,
      ),
    )
  }

  @Implement(contract.orderLinks.renew)
  renew() {
    return implement(contract.orderLinks.renew).handler(async ({ input }) => {
      await this.limiter.consume('orderLinkRenewals', `ip:${this.context.clientAddress()}`)
      await this.links.renew(input.body.token)
    })
  }
}
