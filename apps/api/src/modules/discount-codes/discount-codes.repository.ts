import { Injectable } from '@nestjs/common'
import { type CreateDiscountCode, type DiscountCode } from '@opos/contract'
import {
  addOns,
  discountCodeAddOns,
  discountCodeMerchandiseItems,
  discountCodes,
  discountCodeTicketTypes,
  editions,
  merchandiseItems,
  orders,
  ticketTypes,
} from '@opos/db'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

/** What a code applies to: the identifiers of each kind. */
export interface AppliesTo {
  ticketTypeIds?: readonly string[]
  addOnIds?: readonly string[]
  itemIds?: readonly string[]
}

type Terms = Omit<
  CreateDiscountCode,
  'ticketTypeIds' | 'addOnIds' | 'itemIds' | 'validFrom' | 'validUntil'
> & { validFrom: Date; validUntil: Date }

/**
 * The discount codes of the editions of the tenant in context, as its orgs set them
 * (docs/specs/0008-discount-codes.md). RLS keeps every query inside the tenant, and every code is
 * looked up within the edition of the path, whose permission the request was checked against.
 */
@Injectable()
export class DiscountCodesRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(discountCodes.editionId, editionId), eq(discountCodes.id, id))
  }

  /** The edition's codes by their text, each with the uses orders hold of it. */
  async list(editionId: string): Promise<DiscountCode[]> {
    return this.read(editionId)
  }

  /** The code of the edition, or 404. */
  async get(editionId: string, id: string): Promise<DiscountCode> {
    if (!isUuid(id)) throw notFound('discount code')
    const [code] = await this.read(editionId, id)
    if (!code) throw notFound('discount code')
    return code
  }

  private async read(editionId: string, id?: string): Promise<DiscountCode[]> {
    const tx = this.context.tx()
    const rows = await tx
      .select()
      .from(discountCodes)
      .where(id ? this.inEdition(editionId, id) : eq(discountCodes.editionId, editionId))
      .orderBy(asc(discountCodes.code))
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const uses = await tx
      .select({ id: orders.discountCodeId, uses: count() })
      .from(orders)
      .where(and(inArray(orders.discountCodeId, ids), eq(orders.holds, true)))
      .groupBy(orders.discountCodeId)
    const types = await tx
      .select({
        id: discountCodeTicketTypes.discountCodeId,
        of: discountCodeTicketTypes.ticketTypeId,
      })
      .from(discountCodeTicketTypes)
      .where(inArray(discountCodeTicketTypes.discountCodeId, ids))
    const extras = await tx
      .select({ id: discountCodeAddOns.discountCodeId, of: discountCodeAddOns.addOnId })
      .from(discountCodeAddOns)
      .where(inArray(discountCodeAddOns.discountCodeId, ids))
    const items = await tx
      .select({
        id: discountCodeMerchandiseItems.discountCodeId,
        of: discountCodeMerchandiseItems.merchandiseItemId,
      })
      .from(discountCodeMerchandiseItems)
      .where(inArray(discountCodeMerchandiseItems.discountCodeId, ids))
    const of = (links: { id: string; of: string }[], codeId: string) =>
      links
        .filter((link) => link.id === codeId)
        .map((link) => link.of)
        .sort()
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind,
      percent: row.percent,
      amountMinor: row.amountMinor,
      usageLimit: row.usageLimit,
      uses: uses.find((held) => held.id === row.id)?.uses ?? 0,
      validFrom: row.validFrom.toISOString(),
      validUntil: row.validUntil.toISOString(),
      ended: row.endedAt !== null,
      ticketTypeIds: of(types, row.id),
      addOnIds: of(extras, row.id),
      itemIds: of(items, row.id),
    }))
  }

  /**
   * Holds the ticket types and the add-ons a change of a code names, in the order an order locks
   * them and before the row of the code, which an order locks last
   * (docs/ARCHITECTURE.md, invariant 9). Naming them takes a key share of each row, which waits
   * for an order that holds the row. Taken here, the change waits while it holds nothing of the
   * code; taken under the lock of the code, it would wait for an order that waits for the code.
   */
  async holdNamed(editionId: string, applies: AppliesTo) {
    const tx = this.context.tx()
    const hold = async (
      table: PgTable,
      id: PgColumn,
      edition: PgColumn,
      ids: readonly string[] = [],
    ) => {
      if (ids.length === 0) return
      await tx
        .select({ id })
        .from(table)
        .where(and(eq(edition, editionId), inArray(id, [...ids])))
        .orderBy(asc(id))
        .for('key share')
    }
    await hold(ticketTypes, ticketTypes.id, ticketTypes.editionId, applies.ticketTypeIds)
    await hold(addOns, addOns.id, addOns.editionId, applies.addOnIds)
  }

  /** The stored terms of the code of the edition, its row locked, or 404. */
  async locked(editionId: string, id: string) {
    if (!isUuid(id)) throw notFound('discount code')
    const [row] = await this.context
      .tx()
      .select()
      .from(discountCodes)
      .where(this.inEdition(editionId, id))
      .for('update')
    if (!row) throw notFound('discount code')
    return row
  }

  /** How many orders hold a use of the code. */
  async uses(id: string): Promise<number> {
    const [row] = await this.context
      .tx()
      .select({ uses: count() })
      .from(orders)
      .where(and(eq(orders.discountCodeId, id), eq(orders.holds, true)))
    return row!.uses
  }

  /**
   * Whether every identifier names a row of the edition: a code applies to the catalog of its
   * own edition alone.
   */
  async ofEdition(editionId: string, applies: AppliesTo): Promise<keyof AppliesTo | undefined> {
    const tx = this.context.tx()
    const all = async (table: PgTable, id: PgColumn, edition: PgColumn, ids: readonly string[]) => {
      if (ids.length === 0) return true
      const rows = await tx
        .select({ id })
        .from(table)
        .where(and(eq(edition, editionId), inArray(id, [...ids])))
      return rows.length === new Set(ids).size
    }
    if (
      !(await all(ticketTypes, ticketTypes.id, ticketTypes.editionId, applies.ticketTypeIds ?? []))
    ) {
      return 'ticketTypeIds'
    }
    if (!(await all(addOns, addOns.id, addOns.editionId, applies.addOnIds ?? []))) {
      return 'addOnIds'
    }
    if (
      !(await all(
        merchandiseItems,
        merchandiseItems.id,
        merchandiseItems.editionId,
        applies.itemIds ?? [],
      ))
    ) {
      return 'itemIds'
    }
    return undefined
  }

  /** When the edition ends: where a code's window runs to unless the org says otherwise. */
  async editionEnd(editionId: string): Promise<Date> {
    const [row] = await this.context
      .tx()
      .select({ endsAt: editions.endsAt })
      .from(editions)
      .where(eq(editions.id, editionId))
    if (!row) throw notFound('edition')
    return row.endsAt
  }

  async insert(tenantId: string, editionId: string, terms: Terms): Promise<string> {
    const [row] = await this.context
      .tx()
      .insert(discountCodes)
      .values({
        tenantId,
        editionId,
        code: terms.code,
        kind: terms.kind,
        percent: terms.percent ?? null,
        amountMinor: terms.amountMinor ?? null,
        usageLimit: terms.usageLimit,
        validFrom: terms.validFrom,
        validUntil: terms.validUntil,
      })
      .returning({ id: discountCodes.id })
    return row!.id
  }

  async change(
    editionId: string,
    id: string,
    changes: Partial<
      Pick<
        typeof discountCodes.$inferInsert,
        | 'code'
        | 'kind'
        | 'percent'
        | 'amountMinor'
        | 'usageLimit'
        | 'validFrom'
        | 'validUntil'
        | 'endedAt'
      >
    >,
  ) {
    if (Object.keys(changes).length === 0) return
    await this.context.tx().update(discountCodes).set(changes).where(this.inEdition(editionId, id))
  }

  /** What the code applies to, each kind given replaced as a whole. */
  async apply(tenantId: string, editionId: string, id: string, applies: AppliesTo) {
    const tx = this.context.tx()
    const at = { tenantId, editionId, discountCodeId: id }
    if (applies.ticketTypeIds) {
      await tx.delete(discountCodeTicketTypes).where(eq(discountCodeTicketTypes.discountCodeId, id))
      if (applies.ticketTypeIds.length > 0) {
        await tx
          .insert(discountCodeTicketTypes)
          .values(applies.ticketTypeIds.map((ticketTypeId) => ({ ...at, ticketTypeId })))
      }
    }
    if (applies.addOnIds) {
      await tx.delete(discountCodeAddOns).where(eq(discountCodeAddOns.discountCodeId, id))
      if (applies.addOnIds.length > 0) {
        await tx
          .insert(discountCodeAddOns)
          .values(applies.addOnIds.map((addOnId) => ({ ...at, addOnId })))
      }
    }
    if (applies.itemIds) {
      await tx
        .delete(discountCodeMerchandiseItems)
        .where(eq(discountCodeMerchandiseItems.discountCodeId, id))
      if (applies.itemIds.length > 0) {
        await tx
          .insert(discountCodeMerchandiseItems)
          .values(applies.itemIds.map((merchandiseItemId) => ({ ...at, merchandiseItemId })))
      }
    }
  }

  /** Deletes the code of the edition; one an order used is refused by the order's foreign key. */
  async remove(editionId: string, id: string) {
    if (!isUuid(id)) throw notFound('discount code')
    const gone = await this.context
      .tx()
      .delete(discountCodes)
      .where(this.inEdition(editionId, id))
      .returning({ id: discountCodes.id })
    if (gone.length === 0) throw notFound('discount code')
  }
}
