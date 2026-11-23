import { Injectable } from '@nestjs/common'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { OrdersRepository } from '../checkout/orders.repository'
import { ManagedOrdersRepository } from './managed-orders.repository'
import { alreadyHandedOut, notPaid } from './order-management.errors'

/**
 * Resending an order's confirmation, and the hand-out marks an org makes and takes back on an
 * order's page (docs/specs/0006-order-management.md, S1, H1 and H2). Each runs in the request's
 * transaction under the lock of the order's row: of two marks made at the same moment, one is
 * refused.
 */
@Injectable()
export class OrderHandOuts {
  constructor(
    private readonly managed: ManagedOrdersRepository,
    private readonly orders: OrdersRepository,
    private readonly rateLimiter: RouteRateLimiter,
  ) {}

  /**
   * Queues the confirmation of a "Paid" order again for the order's email. The outbox writes it
   * with the QR code the order carries and an order link of its own. A manual order has neither
   * a QR code nor an email.
   */
  async resend(editionId: string, orderId: string) {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'paid' || order.email === null) throw notPaid()
    await this.rateLimiter.consume('confirmationResends', `order:${order.id}`)
    await this.orders.queueEmail(
      { tenantId: order.tenantId, editionId: order.editionId, orderId: order.id },
      'order-confirmation',
      order.email,
    )
  }

  /** Marks lines of a paid order as handed out; none is marked when one of them was already. */
  async handOut(editionId: string, orderId: string, lineIds: readonly string[], at = new Date()) {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'paid' && order.status !== 'paid-manual') throw notPaid()
    const lines = new Map((await this.managed.lines(order.id)).map((line) => [line.id, line]))
    for (const lineId of lineIds) {
      const line = lines.get(lineId)
      if (!line) throw notFound('line')
      if (line.handedOutAt) throw alreadyHandedOut(line.id, line.handedOutAt)
    }
    // A scanner may mark a line between the read above and this write: the update matches
    // only a line not yet handed out, and a line it missed refuses the whole mark.
    const marked = await this.managed.handOut(order.id, lineIds, at)
    const missed = lineIds.find((lineId) => !marked.includes(lineId))
    if (missed) throw alreadyHandedOut(missed, at)
  }

  /** Takes a line's mark back, whoever made it; a line with no mark stays as it is. */
  async takeBack(editionId: string, orderId: string, lineId: string) {
    const order = await this.managed.locked(editionId, orderId)
    const line = (await this.managed.lines(order.id)).find((held) => held.id === lineId)
    if (!line) throw notFound('line')
    await this.managed.takeBack(order.id, line.id)
  }
}
