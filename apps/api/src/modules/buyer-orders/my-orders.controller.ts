import { Controller } from '@nestjs/common'
import { contract, type MyOrder } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { InTenant } from '../../common/decorators/require-tenant.decorator'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { passedOn } from '../checkout/checkout.errors'
import { withinHold } from '../checkout/hold'
import { OrdersRepository } from '../checkout/orders.repository'
import { notPaid } from '../order-management/order-management.errors'
import { MyOrdersRepository } from './my-orders.repository'
import { OrderLinksRepository } from './order-links.repository'

/**
 * The orders of a signed-in account in a convention (docs/specs/0009-buyer-self-service.md,
 * U1-U4), with no place in the convention's team, as a like needs none. The handlers' own
 * filters are the routes' guard: an order is the account's own, or it is not there.
 */
@Controller()
export class MyOrdersController {
  constructor(
    private readonly mine: MyOrdersRepository,
    private readonly orders: OrdersRepository,
    private readonly read: OrderLinksRepository,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.myOrders.list)
  @InTenant()
  list() {
    return implement(contract.myOrders.list).handler(async () => {
      const tenantId = this.context.tenant().id
      const account = this.context.account()
      const email = account.email.trim().toLowerCase()
      const listed = await this.mine.list(tenantId, account.id)
      const at = new Date()
      const shown: MyOrder[] = []
      for (const order of listed) {
        // "Resend QR code" and "Buy more" are for a paid order alone, and for none an org moved
        // to another address: that order passed to another person.
        const held = order.status === 'paid' && order.email === email
        shown.push({
          id: order.id,
          number: order.number,
          status: order.status,
          placedAt: order.placedAt.toISOString(),
          holdEndsAt: order.holdEndsAt?.toISOString() ?? null,
          // What "Pay now" would answer, so the list offers it only while an attempt starts.
          payable: withinHold(order, at),
          resendable: held,
          holderName: order.holderName,
          edition: { id: order.editionId, slug: order.editionSlug, name: order.editionName },
          lines: await this.read.lines(tenantId, order.id),
          totalMinor: order.totalMinor,
          currency: order.currency,
          bought: held ? await this.orders.boughtWith(tenantId, order.id) : null,
        })
      }
      return shown
    })
  }

  /**
   * "Resend QR code": the confirmation of a paid order again, to the order's own email, while
   * that is the account's. An order an org moved to another address is sent nowhere at this
   * account's asking, and a refusal spends no try of the order's resends.
   */
  @Implement(contract.myOrders.resendConfirmation)
  @InTenant()
  resendConfirmation() {
    return implement(contract.myOrders.resendConfirmation).handler(async ({ input }) => {
      const tenantId = this.context.tenant().id
      const account = this.context.account()
      const order = await this.orders.own(tenantId, account.id, input.params.orderId)
      // An edition taken back answers as an unknown address, as the list of orders does.
      if (!order || !(await this.orders.publishedEdition(tenantId, order.editionId))) {
        throw notFound('order')
      }
      if (order.status !== 'paid' || order.email === null) throw notPaid()
      if (order.email !== account.email.trim().toLowerCase()) throw passedOn()
      await this.limiter.consume('confirmationResends', `order:${order.id}`)
      await this.orders.queueEmail(
        { tenantId, editionId: order.editionId, orderId: order.id },
        'order-confirmation',
        order.email,
      )
    })
  }
}
