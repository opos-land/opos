import { Injectable } from '@nestjs/common'
import { type ManualReason, type OrderStatus } from '@opos/contract'
import {
  merchandiseVariants,
  orderLines,
  orderLinks,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
} from '@opos/db'
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

/** An order, as an org's change of it reads it. */
export interface ManagedOrder {
  id: string
  tenantId: string
  editionId: string
  number: string
  status: OrderStatus
  /** Empty for a manual order, which nobody placed in the shop. */
  email: string | null
  holderName: string
  holds: boolean
  totalMinor: number
  manualReason: ManualReason | null
}

/** What an org's change makes of an order's own row. */
export type OrderChanges = Partial<
  Pick<
    typeof orders.$inferInsert,
    | 'holderName'
    | 'email'
    | 'status'
    | 'holds'
    | 'holdEndsAt'
    | 'paidAt'
    | 'canceledAt'
    | 'cancelReason'
    | 'declinedAt'
    | 'declineReason'
  >
>

/**
 * What an org changes of the orders of an edition of the tenant in context
 * (docs/specs/0006-order-management.md). RLS keeps every query inside the tenant, and every
 * order is looked up within the edition of the path, whose permission the request was checked
 * against.
 */
@Injectable()
export class ManagedOrdersRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * The order of the edition with its row locked until the transaction ends, or 404: whatever
   * then decides what may be done with it decides alone, a payment confirmed at the same moment
   * included.
   */
  async locked(editionId: string, orderId: string): Promise<ManagedOrder> {
    if (!isUuid(orderId)) throw notFound('order')
    const [row] = await this.context
      .tx()
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        editionId: orders.editionId,
        number: orders.number,
        status: orders.status,
        email: orders.email,
        holderName: orders.holderName,
        holds: orders.holds,
        totalMinor: orders.totalMinor,
        manualReason: orders.manualReason,
      })
      .from(orders)
      .where(and(eq(orders.editionId, editionId), eq(orders.id, orderId)))
      .for('update')
    if (!row) throw notFound('order')
    return row
  }

  async change(orderId: string, changes: OrderChanges) {
    await this.context.tx().update(orders).set(changes).where(eq(orders.id, orderId))
  }

  /**
   * The order lets go of the QR code it carries. A code no order carries any more is marked
   * replaced, so the scanner can say why it is refused; one another order still carries stays.
   */
  async releaseQrCode(orderId: string, at: Date) {
    const tx = this.context.tx()
    const [carried] = await tx
      .delete(orderQrCodeOrders)
      .where(eq(orderQrCodeOrders.orderId, orderId))
      .returning({ qrCodeId: orderQrCodeOrders.qrCodeId })
    if (!carried) return
    const [other] = await tx
      .select({ orderId: orderQrCodeOrders.orderId })
      .from(orderQrCodeOrders)
      .where(eq(orderQrCodeOrders.qrCodeId, carried.qrCodeId))
      .limit(1)
    if (other) return
    await tx
      .update(orderQrCodes)
      .set({ replacedAt: at })
      .where(eq(orderQrCodes.id, carried.qrCodeId))
  }

  /** The order links sent so far open nothing from now on. */
  async endLinks(orderId: string, at: Date) {
    await this.context
      .tx()
      .update(orderLinks)
      .set({ endedAt: at })
      .where(and(eq(orderLinks.orderId, orderId), isNull(orderLinks.endedAt)))
  }

  /** A merchandise line of the order, or 404: no other line has a variant to swap. */
  async merchandiseLine(orderId: string, lineId: string) {
    if (!isUuid(lineId)) throw notFound('line')
    const [row] = await this.context
      .tx()
      .select({
        id: orderLines.id,
        merchandiseItemId: orderLines.merchandiseItemId,
        variantId: orderLines.merchandiseVariantId,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(
        and(
          eq(orderLines.orderId, orderId),
          eq(orderLines.id, lineId),
          eq(orderLines.kind, 'merchandise'),
        ),
      )
    if (!row?.merchandiseItemId || !row.variantId) throw notFound('line')
    return { ...row, merchandiseItemId: row.merchandiseItemId, variantId: row.variantId }
  }

  /** Whether the variant is one of the item, in the edition. */
  async isVariantOf(editionId: string, itemId: string, variantId: string): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ id: merchandiseVariants.id })
      .from(merchandiseVariants)
      .where(
        and(
          eq(merchandiseVariants.editionId, editionId),
          eq(merchandiseVariants.merchandiseItemId, itemId),
          eq(merchandiseVariants.id, variantId),
        ),
      )
    return row !== undefined
  }

  /** The line sells another variant of its item from now on, at the price it was sold at. */
  async swap(lineId: string, variantId: string) {
    await this.context
      .tx()
      .update(orderLines)
      .set({ merchandiseVariantId: variantId })
      .where(eq(orderLines.id, lineId))
  }

  /** The lines of the order that are handed over: every line but a discount. */
  async lines(orderId: string) {
    return this.context
      .tx()
      .select({ id: orderLines.id, handedOutAt: orderLines.handedOutAt })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, orderId), ne(orderLines.kind, 'discount')))
  }

  /**
   * Marks lines of the order as handed out at `at`, each by an update that matches only a line
   * not yet handed out, as a scanner's does (docs/ARCHITECTURE.md, invariant 10). Answers the
   * lines it marked.
   */
  async handOut(orderId: string, lineIds: readonly string[], at: Date): Promise<string[]> {
    const marked = await this.context
      .tx()
      .update(orderLines)
      .set({ handedOutAt: at })
      .where(
        and(
          eq(orderLines.orderId, orderId),
          inArray(orderLines.id, [...lineIds]),
          isNull(orderLines.handedOutAt),
        ),
      )
      .returning({ id: orderLines.id })
    return marked.map((line) => line.id)
  }

  /** Takes the hand-out mark of a line of the order back, with the scanner that made it. */
  async takeBack(orderId: string, lineId: string) {
    await this.context
      .tx()
      .update(orderLines)
      .set({ handedOutAt: null, handedOutBy: null })
      .where(and(eq(orderLines.orderId, orderId), eq(orderLines.id, lineId)))
  }
}
