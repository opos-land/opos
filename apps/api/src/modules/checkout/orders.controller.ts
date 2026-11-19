import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { Prepares } from '../../common/decorators/prepares.decorator'
import { InTenant } from '../../common/decorators/require-tenant.decorator'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { BotCheckPreparation } from './bot-check.preparation'
import { botCheckFailed } from './checkout.errors'
import { OrderPlacement } from './order-placement.service'
import { OrdersRepository } from './orders.repository'

/**
 * The orders of a signed-in account in a convention
 * (docs/specs/0004-checkout-and-orders.md): it buys under its own email, with no place in the
 * convention's team, as a like needs none. The handler's own filters are the route's guard: the
 * edition is one of the tenant's that is published, and an order is the account's own.
 */
@Controller()
export class OrdersController {
  constructor(
    private readonly placement: OrderPlacement,
    private readonly orders: OrdersRepository,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.checkout.placeOrder)
  @InTenant()
  @Prepares(BotCheckPreparation)
  placeOrder() {
    return implement(contract.checkout.placeOrder).handler(async ({ input }) => {
      await this.limiter.consume('orderPlacements', `ip:${this.context.clientAddress()}`)
      if (!this.context.prepared<boolean>()) throw botCheckFailed()
      const edition = await this.orders.publishedEdition(input.params.editionId)
      if (!edition) throw notFound('edition')
      const account = this.context.account()
      return this.placement.place(this.context.tenant().id, edition.id, input.body, {
        email: account.email,
        accountId: account.id,
      })
    })
  }
}
