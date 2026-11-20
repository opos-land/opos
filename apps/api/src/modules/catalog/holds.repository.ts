import { Injectable } from '@nestjs/common'
import { addOns, merchandiseVariants, orderLines, orders, ticketTypes } from '@opos/db'
import { and, eq, sql } from 'drizzle-orm'
import { type AnyPgColumn, type PgTable } from 'drizzle-orm/pg-core'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { belowHeld } from './catalog.errors'

/** A row that carries a limit on what is sold, and the column an order's line names it by. */
const LIMITED: Record<
  'ticket-type' | 'add-on' | 'variant',
  { table: PgTable & { id: AnyPgColumn; editionId: AnyPgColumn }; line: AnyPgColumn }
> = {
  'ticket-type': { table: ticketTypes, line: orderLines.ticketTypeId },
  'add-on': { table: addOns, line: orderLines.addOnId },
  variant: { table: merchandiseVariants, line: orderLines.merchandiseVariantId },
}

/** What orders hold of the rows of the catalog that carry a limit; RLS keeps it in the tenant. */
@Injectable()
export class HoldsRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * Refuses a capacity or a stock below what orders hold of the row; no limit at all fits
   * anything. It locks the row before it counts, as placing an order does: an order being placed
   * is waited for and counted, and one placed after waits for this change
   * (docs/ARCHITECTURE.md, invariant 9).
   */
  async fits(kind: keyof typeof LIMITED, editionId: string, id: string, limit: number | null) {
    if (limit === null) return
    const { table, line } = LIMITED[kind]
    const tx = this.context.tx()
    await tx.execute(sql`
      select 1 from ${table}
      where ${table.editionId} = ${editionId} and ${table.id} = ${id} for update
    `)
    const [row] = await tx
      .select({ held: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int` })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(eq(orders.editionId, editionId), eq(orders.holds, true), eq(line, id)))
    if (row!.held > limit) throw belowHeld(row!.held)
  }
}
