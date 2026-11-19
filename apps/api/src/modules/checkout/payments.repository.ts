import { Injectable } from '@nestjs/common'
import {
  type Cart,
  type FailureReason,
  type OrderStatus,
  type PaymentProvider,
} from '@opos/contract'
import {
  accounts,
  addOns,
  editionMemberships,
  editions,
  merchandiseVariants,
  orderAccounts,
  orderLines,
  orders,
  paymentAttempts,
  paymentProviderAccounts,
  tenantMemberships,
  ticketTypes,
} from '@opos/db'
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { isUuid } from '../../common/uuid'
import { OfferRepository } from './offer.repository'

/** An order, as paying for it reads it. */
export interface PayableOrder {
  id: string
  tenantId: string
  editionId: string
  number: string
  status: OrderStatus
  /** Empty for a manual order, which no buyer placed. */
  email: string | null
  totalMinor: number
  currency: string
  holds: boolean
  holdEndsAt: Date | null
  placedAt: Date
  resultTokenHash: string
  editionSlug: string
  editionPublished: boolean
}

export type StoredAttempt = typeof paymentAttempts.$inferSelect

/** What a provider's module said of an attempt, as the attempt keeps it. */
export type AttemptChanges = Partial<
  Pick<
    StoredAttempt,
    | 'status'
    | 'paidAmountMinor'
    | 'paidAt'
    | 'confirmedAt'
    | 'moneyWith'
    | 'providerReference'
    | 'failureReason'
    | 'failureCode'
    | 'failureMessage'
    | 'information'
  >
>

/**
 * The payments of the orders of the tenant of the open transaction; RLS keeps every query inside
 * it. The transaction is one a caller opened for the tenant an address or an attempt named: the
 * tenant is given, never read from the context.
 */
@Injectable()
export class PaymentsRepository {
  constructor(
    private readonly context: TenantContextService,
    private readonly offers: OfferRepository,
  ) {}

  /**
   * The order with its edition, or undefined. `lock` holds its row until the transaction ends:
   * whatever then decides what a payment does of it decides alone.
   */
  async order(orderId: string, lock = false): Promise<PayableOrder | undefined> {
    if (!isUuid(orderId)) return undefined
    const query = this.context
      .tx()
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        editionId: orders.editionId,
        number: orders.number,
        status: orders.status,
        email: orders.email,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        holds: orders.holds,
        holdEndsAt: orders.holdEndsAt,
        placedAt: orders.placedAt,
        resultTokenHash: orders.resultTokenHash,
        editionSlug: editions.slug,
        editionPublished: editions.isPublished,
      })
      .from(orders)
      .innerJoin(editions, eq(editions.id, orders.editionId))
      .where(eq(orders.id, orderId))
    const [row] = await (lock ? query.for('update', { of: orders }) : query)
    return row
  }

  /** Whether the order is attached to the account. */
  async isOf(orderId: string, accountId: string): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ orderId: orderAccounts.orderId })
      .from(orderAccounts)
      .where(and(eq(orderAccounts.orderId, orderId), eq(orderAccounts.accountId, accountId)))
    return row !== undefined
  }

  /** The attempts of the order, the first started first. */
  attempts(orderId: string): Promise<StoredAttempt[]> {
    return this.context
      .tx()
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, orderId))
      .orderBy(asc(paymentAttempts.createdAt), asc(paymentAttempts.id))
  }

  async attempt(attemptId: string): Promise<StoredAttempt | undefined> {
    if (!isUuid(attemptId)) return undefined
    const [row] = await this.context
      .tx()
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    return row
  }

  /** An attempt about to start at the provider, for what the order asks. */
  async addAttempt(order: PayableOrder, provider: PaymentProvider): Promise<string> {
    const [row] = await this.context
      .tx()
      .insert(paymentAttempts)
      .values({
        tenantId: order.tenantId,
        editionId: order.editionId,
        orderId: order.id,
        provider,
        status: 'started',
        amountMinor: order.totalMinor,
      })
      .returning({ id: paymentAttempts.id })
    return row!.id
  }

  async changeAttempt(attemptId: string, changes: AttemptChanges) {
    await this.context
      .tx()
      .update(paymentAttempts)
      .set(changes)
      .where(eq(paymentAttempts.id, attemptId))
  }

  /**
   * Records a failure the provider reported. It does not close the attempt, and changes nothing
   * of one a payment was already confirmed for, or one that ended.
   */
  async fail(
    attemptId: string,
    failure: { reason: FailureReason; code: string | null; message: string | null },
  ) {
    await this.context
      .tx()
      .update(paymentAttempts)
      .set({
        status: 'failed',
        failureReason: failure.reason,
        failureCode: failure.code,
        failureMessage: failure.message,
      })
      .where(
        and(
          eq(paymentAttempts.id, attemptId),
          inArray(paymentAttempts.status, ['started', 'failed']),
        ),
      )
  }

  /** The provider account of the tenant, its credentials sealed. */
  async providerAccount(
    tenantId: string,
  ): Promise<{ provider: PaymentProvider; credentials: string } | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        provider: paymentProviderAccounts.provider,
        credentials: paymentProviderAccounts.credentials,
      })
      .from(paymentProviderAccounts)
      .where(eq(paymentProviderAccounts.tenantId, tenantId))
    return row
  }

  /** What the order's lines take of the catalog, as the cart that placed them did. */
  async cart(orderId: string): Promise<Cart> {
    const lines = await this.context
      .tx()
      .select({
        kind: orderLines.kind,
        ticketTypeId: orderLines.ticketTypeId,
        addOnId: orderLines.addOnId,
        variantId: orderLines.merchandiseVariantId,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
    const ticket = lines.find((line) => line.ticketTypeId !== null)
    return {
      ticket: ticket ? { ticketTypeId: ticket.ticketTypeId! } : null,
      addOnIds: lines.flatMap((line) => line.addOnId ?? []),
      items: lines.flatMap((line) =>
        line.variantId ? [{ variantId: line.variantId, quantity: line.quantity }] : [],
      ),
    }
  }

  /**
   * Whether what a cart takes is still there, beside what the orders that hold already took:
   * the capacity of its ticket type and of its add-ons, and the stock of its variants. The
   * caller locked those rows first (docs/ARCHITECTURE.md, invariant 9).
   */
  async stillThere(editionId: string, cart: Cart): Promise<boolean> {
    const tx = this.context.tx()
    const held = await this.offers.held(editionId)
    if (cart.ticket) {
      const [type] = await tx
        .select({ capacity: ticketTypes.capacity })
        .from(ticketTypes)
        .where(eq(ticketTypes.id, cart.ticket.ticketTypeId))
      const taken = held.ticketTypes.get(cart.ticket.ticketTypeId) ?? 0
      if (!type || (type.capacity !== null && taken + 1 > type.capacity)) return false
    }
    if (cart.addOnIds.length > 0) {
      const rows = await tx
        .select({ id: addOns.id, capacity: addOns.capacity })
        .from(addOns)
        .where(inArray(addOns.id, cart.addOnIds))
      if (rows.length !== new Set(cart.addOnIds).size) return false
      for (const row of rows) {
        const taken = held.addOns.get(row.id) ?? 0
        if (row.capacity !== null && taken + 1 > row.capacity) return false
      }
    }
    if (cart.items.length > 0) {
      const rows = await tx
        .select({ id: merchandiseVariants.id, stock: merchandiseVariants.stock })
        .from(merchandiseVariants)
        .where(
          inArray(
            merchandiseVariants.id,
            cart.items.map((item) => item.variantId),
          ),
        )
      const stock = new Map(rows.map((row) => [row.id, row.stock]))
      for (const item of cart.items) {
        if (!stock.has(item.variantId)) return false
        const left = stock.get(item.variantId)
        const taken = held.variants.get(item.variantId) ?? 0
        if (left !== null && left !== undefined && taken + item.quantity > left) return false
      }
    }
    return true
  }

  /** What a payment makes of the order: its status, and whether it holds what its lines take. */
  async changeOrder(
    orderId: string,
    changes: Partial<
      Pick<typeof orders.$inferInsert, 'status' | 'holds' | 'holdEndsAt' | 'paidAt'>
    >,
  ) {
    await this.context.tx().update(orders).set(changes).where(eq(orders.id, orderId))
  }

  /**
   * Who is alerted of an order an org has to settle: the heads, and the orgs with write access
   * to the edition's tickets, by the address of their account. A membership that expired alerts
   * nobody.
   */
  async orgs(tenantId: string, editionId: string): Promise<string[]> {
    const rows = await this.context
      .tx()
      .selectDistinct({ email: sql<string>`lower(${accounts.email})` })
      .from(tenantMemberships)
      .innerJoin(accounts, eq(accounts.id, tenantMemberships.accountId))
      .leftJoin(
        editionMemberships,
        and(
          eq(editionMemberships.tenantMembershipId, tenantMemberships.id),
          eq(editionMemberships.editionId, editionId),
        ),
      )
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, sql`now()`)),
          or(eq(tenantMemberships.role, 'head'), eq(editionMemberships.ticketsAccess, 'write')),
        ),
      )
    return rows.map((row) => row.email).sort()
  }
}
