import { Controller } from '@nestjs/common'
import { contract, RESULT_TOKEN_HEADER } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { CallsOut } from '../../common/decorators/calls-out.decorator'
import { Prepares } from '../../common/decorators/prepares.decorator'
import { InTenant } from '../../common/decorators/require-tenant.decorator'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { BotCheckPreparation } from './bot-check.preparation'
import { botCheckFailed } from './checkout.errors'
import { OrderPlacement } from './order-placement.service'
import { PaymentAttempts } from './payment-attempts.service'
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
    private readonly attempts: PaymentAttempts,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.checkout.placeOrder)
  @InTenant()
  @Prepares(BotCheckPreparation)
  placeOrder() {
    return implement(contract.checkout.placeOrder).handler(async ({ input }) => {
      const address = this.context.clientAddress()
      await this.limiter.consume('orderPlacements', `ip:${address}`)
      // An order tries its code as a quote does: the tries of both are counted together.
      if (input.body.discountCode !== undefined) {
        await this.limiter.consume('discountCodeTries', `ip:${address}`)
      }
      if (!this.context.prepared<boolean>()) throw botCheckFailed()
      const tenantId = this.context.tenant().id
      const edition = await this.orders.publishedEdition(tenantId, input.params.editionId)
      if (!edition) throw notFound('edition')
      const account = this.context.account()
      return this.placement.place(tenantId, edition.id, input.body, {
        email: account.email,
        accountId: account.id,
      })
    })
  }

  /**
   * The account's own order of the edition: any other is not found. The handler runs outside
   * every transaction, since it asks the provider between the tenant's own.
   */
  @Implement(contract.checkout.startPaymentAttempt)
  @InTenant()
  @CallsOut()
  startPaymentAttempt() {
    return implement(contract.checkout.startPaymentAttempt).handler(async ({ input }) => {
      await this.limiter.consume('paymentAttempts', `ip:${this.context.clientAddress()}`)
      return this.attempts.start(
        this.context.tenant(),
        input.params.orderId,
        {
          accountId: this.context.account().id,
          editionId: input.params.editionId,
          token: input.headers[RESULT_TOKEN_HEADER],
        },
        input.headers['accept-language'],
      )
    })
  }
}
