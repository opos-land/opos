import { Injectable } from '@nestjs/common'
import { editions, editionShops, orderQrCodeOrders, orderQrCodes, orders } from '@opos/db'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/**
 * What the pre-edition reminder reads and writes in the transaction of an edition's tenant
 * (docs/specs/0011-pre-edition-reminder.md). The job has no tenant in context: the tenant and the
 * edition come from its cross-tenant lookup, and every query here names them, as RLS does beside.
 */
@Injectable()
export class RemindersRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * The edition whose reminder has not gone out, with its shop's row locked: of two processes
   * that found it due, the second waits here and then finds it sent.
   */
  async pending(tenantId: string, editionId: string) {
    const [row] = await this.context
      .tx()
      .select({
        startsAt: editions.startsAt,
        daysBefore: editionShops.reminderDaysBefore,
      })
      .from(editionShops)
      .innerJoin(editions, eq(editions.id, editionShops.editionId))
      .where(
        and(
          eq(editionShops.tenantId, tenantId),
          eq(editionShops.editionId, editionId),
          isNotNull(editionShops.reminderDaysBefore),
          isNull(editionShops.reminderSentAt),
          eq(editions.isPublished, true),
        ),
      )
      .for('update', { of: editionShops })
    return row && row.daysBefore !== null
      ? { startsAt: row.startsAt, daysBefore: row.daysBefore }
      : undefined
  }

  /**
   * Whom the reminder goes to (R3, R6): for each QR code of the edition that a paid order still
   * carries, the earliest such order and its email. A canceled order carries nothing for it, and
   * a manual order has neither a code nor an email.
   */
  async recipients(tenantId: string, editionId: string) {
    const rows = await this.context
      .tx()
      .select({
        qrCodeId: orderQrCodeOrders.qrCodeId,
        orderId: orders.id,
        email: orders.email,
      })
      .from(orderQrCodeOrders)
      .innerJoin(orders, eq(orders.id, orderQrCodeOrders.orderId))
      .innerJoin(orderQrCodes, eq(orderQrCodes.id, orderQrCodeOrders.qrCodeId))
      .where(
        and(
          eq(orderQrCodeOrders.tenantId, tenantId),
          eq(orderQrCodeOrders.editionId, editionId),
          eq(orders.status, 'paid'),
          isNotNull(orders.email),
          isNull(orderQrCodes.replacedAt),
        ),
      )
      .orderBy(asc(orders.placedAt), asc(orders.id))
    const first = new Map<string, { orderId: string; email: string }>()
    for (const row of rows) {
      if (row.email !== null && !first.has(row.qrCodeId)) {
        first.set(row.qrCodeId, { orderId: row.orderId, email: row.email })
      }
    }
    return [...first.values()]
  }

  /** The reminder went out: it goes out once an edition. */
  async sent(tenantId: string, editionId: string, at: Date) {
    await this.context
      .tx()
      .update(editionShops)
      .set({ reminderSentAt: at })
      .where(and(eq(editionShops.tenantId, tenantId), eq(editionShops.editionId, editionId)))
  }
}
