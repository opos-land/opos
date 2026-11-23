import { Injectable } from '@nestjs/common'
import { type AgeBand, type OrderStatus, type ScanResult } from '@opos/contract'
import {
  addOns,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseVariantValues,
  orderLines,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  scannerDevices,
  ticketTypePerks,
  ticketTypes,
} from '@opos/db'
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** An order a QR code is on, as a scan judges it. */
export interface ScannedOrder {
  id: string
  number: string
  status: OrderStatus
  holderName: string
  ageBand: AgeBand | null
}

const iso = (moment: Date | null) => moment?.toISOString() ?? null

/**
 * What a scanner reads and marks (docs/specs/0007-scanner.md, S1-S5 and H1-H5), in a transaction
 * opened for the tenant its token named. Nothing here reads the tenant from the context: every
 * query filters on the tenant given, and on the scanner's own edition where it reads an order
 * (docs/ARCHITECTURE.md, invariant 11).
 */
@Injectable()
export class ScansRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The QR code of the tenant by its hash: its edition, and whether an email change replaced it. */
  async code(tenantId: string, codeHash: string) {
    const [row] = await this.context
      .tx()
      .select({
        id: orderQrCodes.id,
        editionId: orderQrCodes.editionId,
        replacedAt: orderQrCodes.replacedAt,
      })
      .from(orderQrCodes)
      .where(and(eq(orderQrCodes.tenantId, tenantId), eq(orderQrCodes.codeHash, codeHash)))
    return row
  }

  /** The orders of the edition that carry the code, in the order they were placed. */
  async orders(tenantId: string, editionId: string, codeId: string): Promise<ScannedOrder[]> {
    return this.context
      .tx()
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        holderName: orders.holderName,
        ageBand: orders.ageBand,
      })
      .from(orderQrCodeOrders)
      .innerJoin(orders, eq(orders.id, orderQrCodeOrders.orderId))
      .where(
        and(
          eq(orderQrCodeOrders.tenantId, tenantId),
          eq(orderQrCodeOrders.qrCodeId, codeId),
          eq(orders.tenantId, tenantId),
          eq(orders.editionId, editionId),
        ),
      )
      .orderBy(asc(orders.placedAt), asc(orders.id))
  }

  /**
   * The orders as a scan shows them: entry with the ticket type's perks, the add-ons and the
   * items, each with when and by which scanner it was handed out. No email address.
   */
  async shown(tenantId: string, scanned: readonly ScannedOrder[]): Promise<ScanResult['orders']> {
    const tx = this.context.tx()
    const orderIds = scanned.map((order) => order.id)
    if (orderIds.length === 0) return []
    const lines = await tx
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        kind: orderLines.kind,
        ticketTypeId: orderLines.ticketTypeId,
        variantId: orderLines.merchandiseVariantId,
        quantity: orderLines.quantity,
        ticketType: ticketTypes.name,
        addOn: addOns.name,
        item: merchandiseItems.name,
        handedOutAt: orderLines.handedOutAt,
        handedOutBy: scannerDevices.name,
      })
      .from(orderLines)
      .leftJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .leftJoin(addOns, eq(addOns.id, orderLines.addOnId))
      .leftJoin(merchandiseItems, eq(merchandiseItems.id, orderLines.merchandiseItemId))
      .leftJoin(scannerDevices, eq(scannerDevices.id, orderLines.handedOutBy))
      .where(
        and(
          eq(orderLines.tenantId, tenantId),
          inArray(orderLines.orderId, orderIds),
          ne(orderLines.kind, 'discount'),
        ),
      )
      .orderBy(asc(orderLines.createdAt), asc(orderLines.id))

    const typeIds = [...new Set(lines.flatMap((line) => line.ticketTypeId ?? []))]
    const perks =
      typeIds.length === 0
        ? []
        : await tx
            .select({ ticketTypeId: ticketTypePerks.ticketTypeId, name: ticketTypePerks.name })
            .from(ticketTypePerks)
            .where(
              and(
                eq(ticketTypePerks.tenantId, tenantId),
                inArray(ticketTypePerks.ticketTypeId, typeIds),
              ),
            )
            .orderBy(asc(ticketTypePerks.position))
    const variantIds = [...new Set(lines.flatMap((line) => line.variantId ?? []))]
    const labels =
      variantIds.length === 0
        ? []
        : await tx
            .select({
              variantId: merchandiseVariantValues.variantId,
              label: merchandiseOptionValues.label,
            })
            .from(merchandiseVariantValues)
            .innerJoin(
              merchandiseOptionValues,
              eq(merchandiseOptionValues.id, merchandiseVariantValues.optionValueId),
            )
            .innerJoin(
              merchandiseOptionAxes,
              eq(merchandiseOptionAxes.id, merchandiseVariantValues.axisId),
            )
            .where(
              and(
                eq(merchandiseVariantValues.tenantId, tenantId),
                inArray(merchandiseVariantValues.variantId, variantIds),
              ),
            )
            .orderBy(asc(merchandiseOptionAxes.position), asc(merchandiseOptionAxes.id))

    return scanned.map((order) => {
      const own = lines.filter((line) => line.orderId === order.id)
      const mark = (line: (typeof lines)[number]) => ({
        lineId: line.id,
        handedOutAt: iso(line.handedOutAt),
        handedOutBy: line.handedOutBy,
      })
      const ticket = own.find((line) => line.kind === 'ticket')
      return {
        orderId: order.id,
        number: order.number,
        holderName: order.holderName,
        ageBand: order.ageBand,
        entry: ticket
          ? {
              ...mark(ticket),
              ticketType: ticket.ticketType ?? '',
              // Handed out with entry: a perk has no mark of its own.
              perks: perks
                .filter((perk) => perk.ticketTypeId === ticket.ticketTypeId)
                .map((perk) => perk.name),
            }
          : null,
        addOns: own
          .filter((line) => line.kind === 'add_on')
          .map((line) => ({ ...mark(line), name: line.addOn ?? '' })),
        items: own
          .filter((line) => line.kind === 'merchandise')
          .map((line) => ({
            ...mark(line),
            name: line.item ?? '',
            variant: labels
              .filter((label) => label.variantId === line.variantId)
              .map((label) => label.label),
            quantity: line.quantity,
          })),
      }
    })
  }

  /**
   * Marks lines of the order as handed out by the scanner, each by an update that matches only a
   * line not yet handed out: of two scanners marking one line at the same moment, the second
   * matches nothing (docs/ARCHITECTURE.md, invariant 10). Answers the lines it marked.
   */
  async handOut(
    tenantId: string,
    orderId: string,
    lineIds: readonly string[],
    scannerId: string,
    at: Date,
  ): Promise<string[]> {
    const marked = await this.context
      .tx()
      .update(orderLines)
      .set({ handedOutAt: at, handedOutBy: scannerId })
      .where(
        and(
          eq(orderLines.tenantId, tenantId),
          eq(orderLines.orderId, orderId),
          inArray(orderLines.id, [...lineIds]),
          isNull(orderLines.handedOutAt),
        ),
      )
      .returning({ id: orderLines.id })
    return marked.map((line) => line.id)
  }

  /** When and by which scanner a line was handed out; the scanner is null for the panel's mark. */
  async mark(tenantId: string, lineId: string) {
    const [row] = await this.context
      .tx()
      .select({ handedOutAt: orderLines.handedOutAt, scanner: scannerDevices.name })
      .from(orderLines)
      .leftJoin(scannerDevices, eq(scannerDevices.id, orderLines.handedOutBy))
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, lineId)))
    return row
  }
}
