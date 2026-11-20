import { Injectable } from '@nestjs/common'
import { type AgeBand, type OrderStatus } from '@opos/contract'
import {
  addOns,
  editionCustomFields,
  editions,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseVariantValues,
  orderCustomFieldAnswers,
  orderLines,
  orders,
  paymentAttempts,
  ticketTypes,
} from '@opos/db'
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** The statuses whose orders hold what they took: the others count nowhere. */
export const HELD = ['paid', 'paid-manual', 'awaiting-payment', 'needs-review'] as const
/** Sold: held by an order that is paid, in the shop or recorded by an org. */
export const SOLD = ['paid', 'paid-manual'] as const

type Held = (typeof HELD)[number]

/**
 * What the reports of an edition's sales read (docs/specs/0010-sales-reports.md). RLS keeps
 * every query inside the tenant in context, and every one names the edition of the path, whose
 * permission the request was checked against. A read locks nothing: a report never slows a sale.
 */
@Injectable()
export class SalesRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The edition's address, which a file is named after. */
  async editionSlug(editionId: string): Promise<string | undefined> {
    const [row] = await this.context
      .tx()
      .select({ slug: editions.slug })
      .from(editions)
      .where(eq(editions.id, editionId))
    return row?.slug
  }

  /** The orders that hold, by status: how many, and the sum of their totals. */
  totals(editionId: string) {
    return this.context
      .tx()
      .select({
        status: orders.status,
        orders: count(),
        totalMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.editionId, editionId), inArray(orders.status, [...HELD])))
      .groupBy(orders.status) as Promise<{ status: Held; orders: number; totalMinor: number }[]>
  }

  /** What the lines of the orders that hold take of the catalog, by status. */
  held(editionId: string) {
    return this.context
      .tx()
      .select({
        status: orders.status,
        ticketTypeId: orderLines.ticketTypeId,
        addOnId: orderLines.addOnId,
        variantId: orderLines.merchandiseVariantId,
        quantity: sql<number>`sum(${orderLines.quantity})::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(eq(orders.editionId, editionId), inArray(orders.status, [...HELD])))
      .groupBy(
        orders.status,
        orderLines.ticketTypeId,
        orderLines.addOnId,
        orderLines.merchandiseVariantId,
      ) as Promise<
      {
        status: Held
        ticketTypeId: string | null
        addOnId: string | null
        variantId: string | null
        quantity: number
      }[]
    >
  }

  /**
   * The sold orders by the day they were paid and by status: the sum of their totals and the
   * tickets they hold. The day is the one of `timeZone`; a sold order that carries no time of
   * payment counts on the day it was placed.
   */
  days(editionId: string, timeZone: string) {
    const tx = this.context.tx()
    // The tickets of each order, counted before the orders are summed: a join on the lines
    // themselves would add an order's total once for each of them.
    const ticketsOf = tx
      .select({
        orderId: orderLines.orderId,
        tickets: sql<number>`sum(${orderLines.quantity})`.as('tickets'),
      })
      .from(orderLines)
      .where(isNotNull(orderLines.ticketTypeId))
      .groupBy(orderLines.orderId)
      .as('tickets_of')
    return (
      tx
        .select({
          day: sql<string>`to_char(coalesce(${orders.paidAt}, ${orders.placedAt}) at time zone ${timeZone}, 'YYYY-MM-DD')`,
          status: orders.status,
          totalMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
          tickets: sql<number>`coalesce(sum(${ticketsOf.tickets}), 0)::int`,
        })
        .from(orders)
        .leftJoin(ticketsOf, eq(ticketsOf.orderId, orders.id))
        .where(and(eq(orders.editionId, editionId), inArray(orders.status, [...SOLD])))
        // By its place in the list: the time zone is a parameter, and one written twice is two
        // parameters, which the database does not take for the same expression.
        .groupBy(sql`1`, orders.status)
        .orderBy(sql`1`) as Promise<
        { day: string; status: (typeof SOLD)[number]; totalMinor: number; tickets: number }[]
      >
    )
  }

  /** The ticket holders of the sold orders, by age band. */
  ageBands(editionId: string) {
    return this.context
      .tx()
      .select({ ageBand: orders.ageBand, holders: count() })
      .from(orders)
      .where(
        and(
          eq(orders.editionId, editionId),
          inArray(orders.status, [...SOLD]),
          isNotNull(orders.ageBand),
        ),
      )
      .groupBy(orders.ageBand) as Promise<{ ageBand: AgeBand; holders: number }[]>
  }

  /** The answers the sold orders gave, each with how many orders gave it. */
  answers(editionId: string) {
    return this.context
      .tx()
      .select({
        fieldId: orderCustomFieldAnswers.customFieldId,
        answer: orderCustomFieldAnswers.answer,
        orders: count(),
      })
      .from(orderCustomFieldAnswers)
      .innerJoin(orders, eq(orders.id, orderCustomFieldAnswers.orderId))
      .where(and(eq(orders.editionId, editionId), inArray(orders.status, [...SOLD])))
      .groupBy(orderCustomFieldAnswers.customFieldId, orderCustomFieldAnswers.answer)
  }

  /** The custom fields of the edition in their order, hidden ones too: an order may answer one. */
  fields(editionId: string) {
    return this.context
      .tx()
      .select({ id: editionCustomFields.id, label: editionCustomFields.label })
      .from(editionCustomFields)
      .where(eq(editionCustomFields.editionId, editionId))
      .orderBy(asc(editionCustomFields.position), asc(editionCustomFields.id))
  }

  /** The orders of the given statuses that hold a ticket, in the order they were placed. */
  ticketOrders(editionId: string, statuses: readonly OrderStatus[]) {
    return this.context
      .tx()
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        holderName: orders.holderName,
        ageBand: orders.ageBand,
        email: orders.email,
        placedAt: orders.placedAt,
        ticketType: ticketTypes.name,
      })
      .from(orders)
      .innerJoin(orderLines, and(eq(orderLines.orderId, orders.id), eq(orderLines.kind, 'ticket')))
      .innerJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .where(and(eq(orders.editionId, editionId), inArray(orders.status, [...statuses])))
      .orderBy(asc(orders.placedAt), asc(orders.id))
  }

  /** The add-ons of every order of the edition, under their names, in the catalog's order. */
  addOnLines(editionId: string) {
    return this.context
      .tx()
      .select({ orderId: orderLines.orderId, name: addOns.name })
      .from(orderLines)
      .innerJoin(addOns, eq(addOns.id, orderLines.addOnId))
      .where(eq(orderLines.editionId, editionId))
      .orderBy(asc(addOns.position), asc(addOns.id))
  }

  /** Every answer of the edition's orders, by order and field. */
  orderAnswers(editionId: string) {
    return this.context
      .tx()
      .select({
        orderId: orderCustomFieldAnswers.orderId,
        fieldId: orderCustomFieldAnswers.customFieldId,
        answer: orderCustomFieldAnswers.answer,
      })
      .from(orderCustomFieldAnswers)
      .where(eq(orderCustomFieldAnswers.editionId, editionId))
  }

  /** The merchandise lines of the sold orders, in the order the orders were placed. */
  async merchandiseLines(editionId: string) {
    const tx = this.context.tx()
    const lines = await tx
      .select({
        number: orders.number,
        holderName: orders.holderName,
        item: merchandiseItems.name,
        variantId: orderLines.merchandiseVariantId,
        quantity: orderLines.quantity,
        handedOutAt: orderLines.handedOutAt,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(merchandiseItems, eq(merchandiseItems.id, orderLines.merchandiseItemId))
      .where(
        and(
          eq(orders.editionId, editionId),
          eq(orderLines.kind, 'merchandise'),
          inArray(orders.status, [...SOLD]),
        ),
      )
      .orderBy(asc(orders.placedAt), asc(orders.id), asc(orderLines.createdAt), asc(orderLines.id))
    const labels = await tx
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
      .where(eq(merchandiseVariantValues.editionId, editionId))
      .orderBy(asc(merchandiseOptionAxes.position))
    return lines.map(({ variantId, ...line }) => ({
      ...line,
      variant: labels.filter((label) => label.variantId === variantId).map(({ label }) => label),
    }))
  }

  /** Every payment attempt of the edition with its order, in the order they were started. */
  attempts(editionId: string) {
    return this.context
      .tx()
      .select({
        id: paymentAttempts.id,
        orderId: orders.id,
        number: orders.number,
        currency: orders.currency,
        provider: paymentAttempts.provider,
        status: paymentAttempts.status,
        amountMinor: paymentAttempts.amountMinor,
        paidAmountMinor: paymentAttempts.paidAmountMinor,
        paidAt: paymentAttempts.paidAt,
        moneyWith: paymentAttempts.moneyWith,
        providerReference: paymentAttempts.providerReference,
        information: paymentAttempts.information,
      })
      .from(paymentAttempts)
      .innerJoin(orders, eq(orders.id, paymentAttempts.orderId))
      .where(eq(paymentAttempts.editionId, editionId))
      .orderBy(asc(paymentAttempts.createdAt), asc(paymentAttempts.id))
  }
}
