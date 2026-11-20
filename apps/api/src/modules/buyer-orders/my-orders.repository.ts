import { Injectable } from '@nestjs/common'
import { type OrderStatus } from '@opos/contract'
import { editions, orderAccounts, orders } from '@opos/db'
import { and, desc, eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** An order of an account as the list of its orders reads it. */
export interface ListedOrder {
  id: string
  number: string
  status: OrderStatus
  placedAt: Date
  holdEndsAt: Date | null
  holderName: string
  totalMinor: number
  currency: string
  editionId: string
  editionSlug: string
  editionName: string
}

/**
 * The orders of a signed-in account in the tenant of the request
 * (docs/specs/0009-buyer-self-service.md, U1 and U4). The account has no place in the
 * convention's team, so the route has no permission to check: these queries are its guard, and
 * filter on the tenant and on the account themselves.
 */
@Injectable()
export class MyOrdersRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The account's orders in the published editions of the tenant, the newest first. */
  list(tenantId: string, accountId: string): Promise<ListedOrder[]> {
    return this.context
      .tx()
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        placedAt: orders.placedAt,
        holdEndsAt: orders.holdEndsAt,
        holderName: orders.holderName,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        editionId: editions.id,
        editionSlug: editions.slug,
        editionName: editions.name,
      })
      .from(orders)
      .innerJoin(orderAccounts, eq(orderAccounts.orderId, orders.id))
      .innerJoin(editions, eq(editions.id, orders.editionId))
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orderAccounts.tenantId, tenantId),
          eq(orderAccounts.accountId, accountId),
          eq(editions.isPublished, true),
        ),
      )
      .orderBy(desc(orders.placedAt), desc(orders.id))
  }
}
