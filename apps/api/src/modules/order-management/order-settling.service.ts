import { Injectable } from '@nestjs/common'
import { orderUnavailable } from '../checkout/checkout.errors'
import { OrderSettlement } from '../checkout/order-settlement.service'
import { OrdersRepository } from '../checkout/orders.repository'
import { PaymentsRepository } from '../checkout/payments.repository'
import { type ManagedOrder, ManagedOrdersRepository } from './managed-orders.repository'
import { notCancelable, notInReview } from './order-management.errors'

/**
 * Canceling a paid order and settling one that needs review
 * (docs/specs/0006-order-management.md, X1-X5 and R2-R5). Each runs in the request's
 * transaction, under the tenant's write lock and the lock of the order's row, and locks the rows
 * that carry the limits the order touches as an order placed in the shop locks them
 * (docs/ARCHITECTURE.md, invariant 9). OPOS returns no money: each changes the order alone.
 */
@Injectable()
export class OrderSettling {
  constructor(
    private readonly managed: ManagedOrdersRepository,
    private readonly orders: OrdersRepository,
    private readonly payments: PaymentsRepository,
    private readonly settlement: OrderSettlement,
  ) {}

  /**
   * Cancels a "Paid" or a "Paid - manual" order: it holds nothing from now on, so its stock and
   * capacity return. Its QR code stays on it, for the scanner to say why it is refused, and so
   * does the account it is on. The buyer of a shop order is told.
   */
  async cancel(editionId: string, orderId: string, reason: string, at = new Date()) {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'paid' && order.status !== 'paid-manual') throw notCancelable()
    await this.lockLimits(order)
    await this.managed.change(order, {
      status: 'canceled',
      holds: false,
      canceledAt: at,
      cancelReason: reason,
    })
    if (order.email) await this.orders.queueEmail(this.of(order), 'order-canceled', order.email)
  }

  /**
   * Marks an order in "Needs review" paid, at the total it was placed at. One that kept its hold
   * becomes "Paid" as it is; one that holds nothing takes again what it held, and is refused
   * while any of it is gone. Paid, it gets what every paid order gets: its QR code, its
   * confirmation and its place on the account of its email.
   */
  async markPaid(editionId: string, orderId: string, at = new Date()) {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'needs-review') throw notInReview()
    const cart = await this.lockLimits(order)
    if (!order.holds) {
      const gone = await this.payments.gone(order.editionId, cart, order.discountCodeId)
      if (gone) throw orderUnavailable(gone)
    }
    await this.managed.change(order, {
      status: 'paid',
      holds: true,
      holdEndsAt: null,
      paidAt: at,
    })
    if (order.email) await this.settlement.paid({ ...this.of(order), email: order.email })
  }

  /**
   * Declines an order in "Needs review": it holds nothing and never gets a QR code. The buyer is
   * told that the payment was declined and where the money is.
   */
  async decline(editionId: string, orderId: string, reason: string, at = new Date()) {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'needs-review') throw notInReview()
    await this.lockLimits(order)
    await this.managed.change(order, {
      status: 'declined',
      holds: false,
      holdEndsAt: null,
      declinedAt: at,
      declineReason: reason,
    })
    if (order.email) await this.orders.queueEmail(this.of(order), 'order-declined', order.email)
  }

  /** Locks the limits the order's lines touch, and answers what those lines take. */
  private async lockLimits(order: ManagedOrder) {
    const cart = await this.payments.cart(order.id)
    await this.orders.lockLimits(order.editionId, cart)
    return cart
  }

  private of(order: ManagedOrder) {
    return { tenantId: order.tenantId, editionId: order.editionId, orderId: order.id }
  }
}
