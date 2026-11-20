import { Injectable } from '@nestjs/common'
import { type DiscountTerms } from '@opos/contract'
import {
  discountCodeAddOns,
  discountCodeMerchandiseItems,
  discountCodes,
  discountCodeTicketTypes,
  orders,
} from '@opos/db'
import { and, count, eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** A discount code as checkout reads it: its terms, its limit and when it may be used. */
export interface StoredDiscount extends DiscountTerms {
  id: string
  usageLimit: number | null
  validFrom: Date
  validUntil: Date
  endedAt: Date | null
}

/**
 * The discount codes of the tenant of the open transaction, as checkout uses them
 * (docs/specs/0008-discount-codes.md). RLS keeps every query inside the tenant, and a code is
 * looked up inside the edition the shop's address names: another edition's code is unknown.
 */
@Injectable()
export class DiscountsRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The code of the edition by its text, in lower case, with what it applies to. */
  async find(editionId: string, code: string): Promise<StoredDiscount | undefined> {
    const tx = this.context.tx()
    const [row] = await tx
      .select()
      .from(discountCodes)
      .where(and(eq(discountCodes.editionId, editionId), eq(discountCodes.code, code)))
    if (!row) return undefined
    const of = eq(discountCodeTicketTypes.discountCodeId, row.id)
    const types = await tx
      .select({ id: discountCodeTicketTypes.ticketTypeId })
      .from(discountCodeTicketTypes)
      .where(of)
    const addOns = await tx
      .select({ id: discountCodeAddOns.addOnId })
      .from(discountCodeAddOns)
      .where(eq(discountCodeAddOns.discountCodeId, row.id))
    const items = await tx
      .select({ id: discountCodeMerchandiseItems.merchandiseItemId })
      .from(discountCodeMerchandiseItems)
      .where(eq(discountCodeMerchandiseItems.discountCodeId, row.id))
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      percent: row.percent,
      amountMinor: row.amountMinor,
      usageLimit: row.usageLimit,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      endedAt: row.endedAt,
      ticketTypeIds: types.map((type) => type.id),
      addOnIds: addOns.map((addOn) => addOn.id),
      itemIds: items.map((item) => item.id),
    }
  }

  /**
   * Locks the code's row of the edition and answers its limit, or undefined where it is not
   * there. It is the last lock an order takes, after the rows of its stock and capacity: whatever
   * then counts the code's uses counts alone (docs/ARCHITECTURE.md, invariant 9).
   */
  async lock(editionId: string, id: string): Promise<{ usageLimit: number | null } | undefined> {
    const [row] = await this.context
      .tx()
      .select({ usageLimit: discountCodes.usageLimit })
      .from(discountCodes)
      .where(and(eq(discountCodes.editionId, editionId), eq(discountCodes.id, id)))
      .for('update')
    return row
  }

  /** The limit of the code of the edition, with no lock: what a quote reads. */
  async limit(editionId: string, id: string): Promise<{ usageLimit: number | null } | undefined> {
    const [row] = await this.context
      .tx()
      .select({ usageLimit: discountCodes.usageLimit })
      .from(discountCodes)
      .where(and(eq(discountCodes.editionId, editionId), eq(discountCodes.id, id)))
    return row
  }

  /** How many orders hold a use of the code: one that expired or was canceled has let go. */
  async uses(id: string): Promise<number> {
    const [row] = await this.context
      .tx()
      .select({ uses: count() })
      .from(orders)
      .where(and(eq(orders.discountCodeId, id), eq(orders.holds, true)))
    return row!.uses
  }
}
