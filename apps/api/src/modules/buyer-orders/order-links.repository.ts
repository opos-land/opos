import { Injectable } from '@nestjs/common'
import { type LinkedOrder } from '@opos/contract'
import {
  addOns,
  discountCodes,
  editions,
  editionShops,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseVariantValues,
  orderEmails,
  orderLines,
  orderLinks,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  tenants,
  ticketTypes,
} from '@opos/db'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** A link as it stands: the order it opens, when it expires and whether it was ended. */
export interface StoredLink {
  orderId: string
  expiresAt: Date
  endedAt: Date | null
}

/** An order as its link reads it: what its page shows, and what a fresh link is sent to. */
export interface OrderOfLink extends Omit<LinkedOrder, 'qrCode' | 'pickupInformation' | 'lines'> {
  id: string
  tenantId: string
  editionId: string
  email: string | null
}

/**
 * What an order link opens (docs/specs/0009-buyer-self-service.md, K1-K5). Its routes have no
 * tenant in their address: the tenant comes from the link, and every query here filters on it,
 * as RLS does beside.
 */
@Injectable()
export class OrderLinksRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The link of the tenant by the hash of its token. */
  async byHash(tenantId: string, tokenHash: string): Promise<StoredLink | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        orderId: orderLinks.orderId,
        expiresAt: orderLinks.expiresAt,
        endedAt: orderLinks.endedAt,
      })
      .from(orderLinks)
      .where(and(eq(orderLinks.tenantId, tenantId), eq(orderLinks.tokenHash, tokenHash)))
    return row
  }

  /**
   * The order of the tenant with its edition and its convention, while the edition is
   * published: a link of an edition taken back opens nothing, as its shop does.
   */
  async order(tenantId: string, orderId: string): Promise<OrderOfLink | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        editionId: orders.editionId,
        email: orders.email,
        number: orders.number,
        status: orders.status,
        placedAt: orders.placedAt,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        editionSlug: editions.slug,
        editionName: editions.name,
        editionStartsAt: editions.startsAt,
        editionEndsAt: editions.endsAt,
        conventionSlug: tenants.slug,
        conventionName: tenants.name,
        conventionTimezone: tenants.timezone,
      })
      .from(orders)
      .innerJoin(editions, eq(editions.id, orders.editionId))
      .innerJoin(tenants, eq(tenants.id, orders.tenantId))
      .where(
        and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), eq(editions.isPublished, true)),
      )
    if (!row) return undefined
    return {
      id: row.id,
      tenantId: row.tenantId,
      editionId: row.editionId,
      email: row.email,
      number: row.number,
      status: row.status,
      placedAt: row.placedAt.toISOString(),
      totalMinor: row.totalMinor,
      currency: row.currency,
      convention: {
        slug: row.conventionSlug,
        name: row.conventionName,
        timezone: row.conventionTimezone,
      },
      edition: {
        slug: row.editionSlug,
        name: row.editionName,
        startsAt: row.editionStartsAt.toISOString(),
        endsAt: row.editionEndsAt.toISOString(),
      },
    }
  }

  /** The lines of the order under the names of what they sell, the ticket first. */
  async lines(tenantId: string, orderId: string): Promise<LinkedOrder['lines']> {
    const tx = this.context.tx()
    const rows = await tx
      .select({
        kind: orderLines.kind,
        quantity: orderLines.quantity,
        amountMinor: orderLines.amountMinor,
        variantId: orderLines.merchandiseVariantId,
        ticketType: ticketTypes.name,
        addOn: addOns.name,
        item: merchandiseItems.name,
        discount: discountCodes.code,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .leftJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .leftJoin(addOns, eq(addOns.id, orderLines.addOnId))
      .leftJoin(merchandiseItems, eq(merchandiseItems.id, orderLines.merchandiseItemId))
      .leftJoin(discountCodes, eq(discountCodes.id, orders.discountCodeId))
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId)))
      .orderBy(asc(orderLines.kind), asc(orderLines.createdAt), asc(orderLines.id))
    const variantIds = rows.flatMap((row) => row.variantId ?? [])
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
            .orderBy(asc(merchandiseOptionAxes.position))
    return rows.map((row) => ({
      kind: row.kind,
      // A discount's line is told by the code that took it off.
      name:
        row.kind === 'discount'
          ? (row.discount ?? '')
          : (row.ticketType ?? row.addOn ?? row.item ?? ''),
      variant: labels
        .filter((label) => label.variantId === row.variantId)
        .map(({ label }) => label),
      quantity: row.quantity,
      amountMinor: row.amountMinor,
    }))
  }

  /** The QR code the order carries, sealed, with the identifier it is sealed for. */
  async qrCode(
    tenantId: string,
    orderId: string,
  ): Promise<{ id: string; code: string } | undefined> {
    const [row] = await this.context
      .tx()
      .select({ id: orderQrCodes.id, code: orderQrCodes.code })
      .from(orderQrCodeOrders)
      .innerJoin(orderQrCodes, eq(orderQrCodes.id, orderQrCodeOrders.qrCodeId))
      .where(
        and(
          eq(orderQrCodeOrders.tenantId, tenantId),
          eq(orderQrCodeOrders.orderId, orderId),
          isNull(orderQrCodes.replacedAt),
        ),
      )
    return row
  }

  /** Where and when the edition hands merchandise over, when it says. */
  async pickupInformation(tenantId: string, editionId: string): Promise<string | null> {
    const [row] = await this.context
      .tx()
      .select({ pickupInformation: editionShops.pickupInformation })
      .from(editionShops)
      .where(and(eq(editionShops.tenantId, tenantId), eq(editionShops.editionId, editionId)))
    return row?.pickupInformation ?? null
  }

  /** Whether a fresh link was queued for the order since `since`, sent or not. */
  async linkQueuedSince(tenantId: string, orderId: string, since: Date): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ id: orderEmails.id })
      .from(orderEmails)
      .where(
        and(
          eq(orderEmails.tenantId, tenantId),
          eq(orderEmails.orderId, orderId),
          eq(orderEmails.kind, 'order-link'),
          gt(orderEmails.queuedAt, since),
        ),
      )
      .limit(1)
    return row !== undefined
  }
}
