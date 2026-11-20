import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { OrderLinks } from './order-links.service'

/**
 * The routes of an order link (docs/specs/0009-buyer-self-service.md), open to anyone who holds
 * the token. It travels in the body, so no address of the API carries it, and each route has a
 * rate limit of its own for the client's address.
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
    return implement(contract.orderLinks.open).handler(async ({ input }) => {
      await this.limiter.consume('orderLinkOpens', `ip:${this.context.clientAddress()}`)
      return this.links.open(input.body.token)
    })
  }

  @Implement(contract.orderLinks.renew)
  renew() {
    return implement(contract.orderLinks.renew).handler(async ({ input }) => {
      await this.limiter.consume('orderLinkRenewals', `ip:${this.context.clientAddress()}`)
      await this.links.renew(input.body.token)
    })
  }
}
