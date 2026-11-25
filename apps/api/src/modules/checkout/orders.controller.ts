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
import {
  botCheckFailed,
  quoteRefusedForDiscountCode,
  refusedForDiscountCode,
} from './checkout.errors'
import { OrderPlacement } from './order-placement.service'
import { PaymentAttempts } from './payment-attempts.service'
import { OrdersRepository } from './orders.repository'
import { Quotes } from './quotes.service'

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
    private readonly quotes: Quotes,
    private readonly orders: OrdersRepository,
    private readonly attempts: PaymentAttempts,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  /**
   * The price of the account's cart, with the discount code the buyer entered. A cart that adds
   * to the account's own paid order is priced as that order is added to, which the quote for
   * anyone cannot tell: it knows no order.
   */
  @Implement(contract.checkout.quote)
  @InTenant()
  quote() {
    return implement(contract.checkout.quote).handler(async ({ input }) => {
      const address = this.context.clientAddress()
      await this.limiter.consume('shopQuotes', `ip:${address}`)
      const tenantId = this.context.tenant().id
      const edition = await this.orders.publishedEdition(tenantId, input.params.editionId)
      if (!edition) throw notFound('edition')
      const account = this.context.account()
      const { extendsOrderId, ...request } = input.body
      const price = async () => {
        const more =
          extendsOrderId === undefined
            ? undefined
            : await this.placement.extended(
                tenantId,
                edition.id,
                { email: account.email, accountId: account.id },
                extendsOrderId,
              )
        return this.quotes.of(tenantId, edition.id, request, more?.extending)
      }
      if (request.discountCode === undefined) return price()
      // A code that is refused is a try of one, counted with an order's and with the quote for
      // anyone; one that can be used is none.
      return this.limiter.counting(
        'discountCodeTries',
        `ip:${address}`,
        price,
        quoteRefusedForDiscountCode,
      )
    })
  }

  @Implement(contract.checkout.placeOrder)
  @InTenant()
  @Prepares(BotCheckPreparation)
  placeOrder() {
    return implement(contract.checkout.placeOrder).handler(async ({ input }) => {
      const address = this.context.clientAddress()
      await this.limiter.consume('orderPlacements', `ip:${address}`)
      // An address out of tries of a discount code is refused before its code is looked at.
      if (input.body.discountCode !== undefined) {
        this.limiter.check('discountCodeTries', `ip:${address}`)
      }
      if (!this.context.prepared<boolean>()) throw botCheckFailed()
      const tenantId = this.context.tenant().id
      const edition = await this.orders.publishedEdition(tenantId, input.params.editionId)
      if (!edition) throw notFound('edition')
      const account = this.context.account()
      const place = () =>
        this.placement.place(tenantId, edition.id, input.body, {
          email: account.email,
          accountId: account.id,
        })
      if (input.body.discountCode === undefined) return place()
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
