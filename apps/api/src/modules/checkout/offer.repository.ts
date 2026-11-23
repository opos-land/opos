import { Injectable } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { editionShops, orderLines, orders, paymentProviderAccounts, shopSellers } from '@opos/db'
import { and, eq, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** What orders hold of each limit of an edition: the quantities of the lines that count. */
export interface Held {
  ticketTypes: ReadonlyMap<string, number>
  addOns: ReadonlyMap<string, number>
  variants: ReadonlyMap<string, number>
}

/**
 * What the shop's offer reads beside the catalog: the shop of the edition, the seller and the
 * provider of its convention, and what orders hold. It runs in a transaction opened for the
 * tenant an address named, where nobody was admitted and the context holds no tenant of its own:
 * the tenant is given, and RLS keeps every query inside it.
 */
@Injectable()
export class OfferRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The shop of the edition, or undefined while nothing was set for it. */
  async shop(editionId: string) {
    const [row] = await this.context
      .tx()
      .select({
        openedAt: editionShops.openedAt,
        faqUrl: editionShops.faqUrl,
        teenFromAge: editionShops.teenFromAge,
        adultFromAge: editionShops.adultFromAge,
        guardianConsentFormUrl: editionShops.guardianConsentFormUrl,
        merchPreorderDeadline: editionShops.merchPreorderDeadline,
        merchOnlyEnabled: editionShops.merchOnlyEnabled,
        salesClosedMessage: editionShops.salesClosedMessage,
      })
      .from(editionShops)
      .where(eq(editionShops.editionId, editionId))
    return row
  }

  /** The seller's details, once every part of them is set: what the shop's footer shows. */
  async seller(tenantId: string) {
    const [row] = await this.context
      .tx()
      .select({
        name: shopSellers.sellerName,
        address: shopSellers.sellerAddress,
        registrationNumber: shopSellers.sellerRegistrationNumber,
        contactEmail: shopSellers.contactEmail,
      })
      .from(shopSellers)
      .where(eq(shopSellers.tenantId, tenantId))
    if (!row?.name || !row.address || !row.registrationNumber || !row.contactEmail) return null
    return row as {
      name: string
      address: string
      registrationNumber: string
      contactEmail: string
    }
  }

  /** The provider of the convention's account while it is ready to sell; never its credentials. */
  async provider(tenantId: string): Promise<PaymentProvider | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        provider: paymentProviderAccounts.provider,
        readyAt: paymentProviderAccounts.readyAt,
      })
      .from(paymentProviderAccounts)
      .where(eq(paymentProviderAccounts.tenantId, tenantId))
    return row?.readyAt ? row.provider : undefined
  }

  /**
   * What the orders that hold take of each ticket type, add-on and variant of the edition. A
   * reading for the offer alone: placing an order counts again, under the locks of the rows that
   * carry the limits.
   */
  async held(editionId: string): Promise<Held> {
    const rows = await this.context
      .tx()
      .select({
        ticketTypeId: orderLines.ticketTypeId,
        addOnId: orderLines.addOnId,
        variantId: orderLines.merchandiseVariantId,
        held: sql<number>`sum(${orderLines.quantity})::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(eq(orders.editionId, editionId), eq(orders.holds, true)))
      .groupBy(orderLines.ticketTypeId, orderLines.addOnId, orderLines.merchandiseVariantId)
    const by = (key: 'ticketTypeId' | 'addOnId' | 'variantId') =>
      new Map(rows.flatMap((row) => (row[key] ? [[row[key], row.held] as const] : [])))
    return { ticketTypes: by('ticketTypeId'), addOns: by('addOnId'), variants: by('variantId') }
  }
}
