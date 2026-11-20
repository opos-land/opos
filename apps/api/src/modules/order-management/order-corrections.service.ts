import { Injectable } from '@nestjs/common'
import { type Cart } from '@opos/contract'
import { notFound } from '../../common/errors/api-error'
import { orderUnavailable } from '../checkout/checkout.errors'
import { OrderSettlement } from '../checkout/order-settlement.service'
import { type OrderEmailKind, OrdersRepository } from '../checkout/orders.repository'
import { PaymentsRepository } from '../checkout/payments.repository'
import { type ManagedOrder, ManagedOrdersRepository } from './managed-orders.repository'
import { notCorrectable } from './order-management.errors'

/**
 * What an org corrects of a paid order (docs/specs/0006-order-management.md, C1-C6). Each runs
 * in the request's transaction, under the tenant's write lock and the lock of the order's row,
 * and tells the buyer what changed; a manual order has nobody to tell.
 */
@Injectable()
export class OrderCorrections {
  constructor(
    private readonly managed: ManagedOrdersRepository,
    private readonly orders: OrdersRepository,
    private readonly payments: PaymentsRepository,
    private readonly settlement: OrderSettlement,
  ) {}

  /** The ticket holder's name: only an edit, nothing else changes with it. */
  async holder(editionId: string, orderId: string, holderName: string) {
    const order = await this.correctable(editionId, orderId)
    if (order.holderName === holderName) return
    await this.managed.change(order.id, { holderName })
    await this.tell(order, 'order-holder-changed')
  }

  /**
   * The order's email: the order gets a new QR code and a new order link, the old ones stop
   * working, and both addresses are told. The order stays on the account it was on.
   */
  async email(editionId: string, orderId: string, email: string, at = new Date()) {
    const order = await this.correctable(editionId, orderId)
    // A manual order has no email to change.
    if (order.email === null) throw notCorrectable()
    if (order.email === email) return
    const of = { tenantId: order.tenantId, editionId: order.editionId, orderId: order.id }
    await this.managed.releaseQrCode(order.id, at)
    await this.settlement.issueQrCode(of)
    await this.managed.endLinks(order.id, at)
    await this.managed.change(order.id, { email })
    await this.orders.queueEmail(of, 'order-email-changed', email)
    await this.orders.queueEmail(of, 'order-email-replaced', order.email)
  }

  /**
   * A merchandise line's variant, for another of the same item: the stock moves between them,
   * since a line holds the stock of the variant it names. Refused when the other has too few
   * left.
   */
  async variant(editionId: string, orderId: string, lineId: string, variantId: string) {
    const order = await this.correctable(editionId, orderId)
    const line = await this.managed.merchandiseLine(order.id, lineId)
    if (!(await this.managed.isVariantOf(editionId, line.merchandiseItemId, variantId))) {
      throw notFound('variant')
    }
    if (line.variantId === variantId) return
    const taken: Cart = {
      ticket: null,
      addOnIds: [],
      items: [{ variantId, quantity: line.quantity }],
    }
    // Both variants, as an order placed in the shop locks them: an order placed at the same
    // moment waits, and is counted (docs/ARCHITECTURE.md, invariant 9).
    await this.orders.lockLimits(editionId, {
      ...taken,
      items: [...taken.items, { variantId: line.variantId, quantity: line.quantity }],
    })
    if (!(await this.payments.stillThere(editionId, taken))) {
      throw orderUnavailable({ kind: 'variant', id: variantId })
    }
    await this.managed.swap(line.id, variantId)
    await this.tell(order, 'order-variant-changed')
  }

  /** The order with its row locked, when it is one a correction is made on. */
  private async correctable(editionId: string, orderId: string): Promise<ManagedOrder> {
    const order = await this.managed.locked(editionId, orderId)
    if (order.status !== 'paid' && order.status !== 'paid-manual') throw notCorrectable()
    return order
  }

  /** Tells the buyer what changed; a manual order has no buyer to tell. */
  private async tell(order: ManagedOrder, kind: OrderEmailKind) {
    if (order.email === null) return
    const of = { tenantId: order.tenantId, editionId: order.editionId, orderId: order.id }
    await this.orders.queueEmail(of, kind, order.email)
  }
}
