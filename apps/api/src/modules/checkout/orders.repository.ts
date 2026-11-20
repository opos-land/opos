import { Injectable } from '@nestjs/common'
import { type AgeBand, type Cart, type PricedLine } from '@opos/contract'
import {
  accounts,
  addOns,
  editions,
  merchandiseVariants,
  orderAccounts,
  orderConsents,
  orderCustomFieldAnswers,
  orderEmails,
  orderLines,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  ticketTypes,
} from '@opos/db'
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { isUuid } from '../../common/uuid'
import { providerAccountLockKey } from '../shop/provider-account-lock'

/** An order as it is written when it is placed. */
export interface NewOrder {
  tenantId: string
  editionId: string
  number: string
  status: 'awaiting-payment' | 'paid'
  email: string
  holderName: string
  ageBand: AgeBand | null
  totalMinor: number
  holdEndsAt: Date | null
  placedAt: Date
  paidAt: Date | null
  guardianConsentAcknowledgedAt: Date | null
  providerConsentAcceptedAt: Date | null
  resultTokenHash: string
}

/** What kinds of email an order sends. */
export type OrderEmailKind = (typeof orderEmails.kind.enumValues)[number]

/**
 * The orders of the tenant of the open transaction; RLS keeps every query inside it. The
 * transaction is one a caller opened for the tenant an address named, or the request's own: the
 * tenant and the edition are given, never read from the context.
 */
@Injectable()
export class OrdersRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * The published edition of the tenant, or undefined. It is the only guard of the route an
   * account places an order through, so it filters on the tenant itself too.
   */
  async publishedEdition(tenantId: string, editionId: string): Promise<{ id: string } | undefined> {
    if (!isUuid(editionId)) return undefined
    const [row] = await this.context
      .tx()
      .select({ id: editions.id })
      .from(editions)
      .where(
        and(
          eq(editions.tenantId, tenantId),
          eq(editions.id, editionId),
          eq(editions.isPublished, true),
        ),
      )
    return row
  }

  /**
   * Locks the rows that carry the limits a cart touches, in one fixed order: the ticket type, then
   * the add-ons, then the variants, each by identifier. Whatever counts what orders hold of them
   * afterwards counts alone: another order of the same thing waits here, and so does a change of
   * its capacity or its stock (docs/ARCHITECTURE.md, invariant 9).
   */
  async lockLimits(editionId: string, cart: Cart) {
    const tx = this.context.tx()
    if (cart.ticket) {
      await tx
        .select({ id: ticketTypes.id })
        .from(ticketTypes)
        .where(
          and(eq(ticketTypes.editionId, editionId), eq(ticketTypes.id, cart.ticket.ticketTypeId)),
        )
        .for('update')
    }
    if (cart.addOnIds.length > 0) {
      await tx
        .select({ id: addOns.id })
        .from(addOns)
        .where(and(eq(addOns.editionId, editionId), inArray(addOns.id, cart.addOnIds)))
        .orderBy(asc(addOns.id))
        .for('update')
    }
    if (cart.items.length > 0) {
      await tx
        .select({ id: merchandiseVariants.id })
        .from(merchandiseVariants)
        .where(
          and(
            eq(merchandiseVariants.editionId, editionId),
            inArray(
              merchandiseVariants.id,
              cart.items.map((item) => item.variantId),
            ),
          ),
        )
        .orderBy(asc(merchandiseVariants.id))
        .for('update')
    }
  }

  /**
   * Keeps the provider account of the tenant as it is until the order is placed, sharing its lock
   * with the other orders being placed: a change of its credentials waits, then counts the order
   * and is refused, so the payment is confirmed with the credentials it starts with.
   */
  async holdProviderAccount(tenantId: string) {
    await this.context
      .tx()
      .execute(
        sql`select pg_advisory_xact_lock_shared(${providerAccountLockKey(tenantId)}::bigint)`,
      )
  }

  /** How many orders of the edition await payment under the email. */
  async unpaid(editionId: string, email: string): Promise<number> {
    const [row] = await this.context
      .tx()
      .select({ unpaid: count() })
      .from(orders)
      .where(
        and(
          eq(orders.editionId, editionId),
          eq(orders.email, email),
          eq(orders.status, 'awaiting-payment'),
        ),
      )
    return row!.unpaid
  }

  /**
   * Writes an order with its lines; it holds what its lines take from the moment it is there.
   * Answers its identifier, or undefined where its number is another order's already.
   */
  async insert(order: NewOrder, lines: readonly PricedLine[]): Promise<string | undefined> {
    const tx = this.context.tx()
    const [row] = await tx
      .insert(orders)
      .values({ ...order, holds: true })
      .onConflictDoNothing({ target: [orders.tenantId, orders.number] })
      .returning({ id: orders.id })
    if (!row) return undefined
    const of = { tenantId: order.tenantId, editionId: order.editionId, orderId: row.id }
    await tx.insert(orderLines).values(
      lines.map((line) => ({
        ...of,
        kind: line.kind,
        ticketTypeId: line.ticketTypeId ?? null,
        addOnId: line.addOnId ?? null,
        merchandiseItemId: line.merchandiseItemId ?? null,
        merchandiseVariantId: line.variantId ?? null,
        quantity: line.quantity,
        unitAmountMinor: line.unitAmountMinor,
        amountMinor: line.amountMinor,
      })),
    )
    return row.id
  }

  /** What the ticket holder answered and accepted, written once with the order. */
  async addHolderData(
    order: { tenantId: string; editionId: string; orderId: string },
    data: {
      answers: readonly { fieldId: string; answer: string }[]
      consents: readonly { consentId: string; documentVersionId: string | null }[]
      acceptedAt: Date
    },
  ) {
    const tx = this.context.tx()
    if (data.answers.length > 0) {
      await tx
        .insert(orderCustomFieldAnswers)
        .values(
          data.answers.map(({ fieldId, answer }) => ({ ...order, customFieldId: fieldId, answer })),
        )
    }
    if (data.consents.length > 0) {
      await tx
        .insert(orderConsents)
        .values(
          data.consents.map((consent) => ({ ...order, ...consent, acceptedAt: data.acceptedAt })),
        )
    }
  }

  /** Attaches the order to an account; an order attached already stays as it is. */
  async attach(order: { tenantId: string; editionId: string; orderId: string }, accountId: string) {
    await this.context
      .tx()
      .insert(orderAccounts)
      .values({ ...order, accountId })
      .onConflictDoNothing()
  }

  /**
   * The account whose confirmed email is the order's: the owner of a visitor's order once it is
   * paid. An address nobody confirmed is nobody's.
   */
  async accountOf(email: string): Promise<string | undefined> {
    const [row] = await this.context
      .tx()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(sql`lower(${accounts.email}) = ${email}`, isNotNull(accounts.emailConfirmedAt)))
    return row?.id
  }

  /** A QR code of the edition, sealed, for the order to carry. */
  async addQrCode(
    order: { tenantId: string; editionId: string; orderId: string },
    code: { id: string; codeHash: string; code: string },
  ) {
    const tx = this.context.tx()
    const { orderId, ...at } = order
    await tx.insert(orderQrCodes).values({ ...at, ...code })
    await tx.insert(orderQrCodeOrders).values({ ...at, orderId, qrCodeId: code.id })
  }

  /** Queues an email of the order: the outbox sends it once the transaction is committed. */
  async queueEmail(
    order: { tenantId: string; editionId: string; orderId: string },
    kind: OrderEmailKind,
    recipient: string,
  ) {
    await this.context
      .tx()
      .insert(orderEmails)
      .values({ ...order, kind, recipient })
  }
}
