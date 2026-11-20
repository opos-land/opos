import { Injectable } from '@nestjs/common'
import {
  type OrderDetail,
  type OrderList,
  type OrderListQuery,
  type OrderSummary,
} from '@opos/contract'
import {
  accounts,
  addOns,
  editionConsents,
  editionCustomFields,
  editionDocuments,
  editionDocumentVersions,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseVariantValues,
  orderAccounts,
  orderConsents,
  orderCustomFieldAnswers,
  orderEmails,
  orderLines,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  paymentAttempts,
  ticketTypes,
} from '@opos/db'
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { type PgColumn } from 'drizzle-orm/pg-core'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

/** A text as a pattern finds it and nothing else: what a pattern reads as "anything" is escaped. */
const part = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`

const iso = (moment: Date | null) => moment?.toISOString() ?? null

/**
 * What an org reads of the orders of an edition of the tenant in context
 * (docs/specs/0006-order-management.md, F1-F3). RLS keeps every query inside the tenant, and
 * every order is looked up within the edition of the path, whose permission the request was
 * checked against: a search reads the names and the addresses of that edition's orders alone.
 */
@Injectable()
export class OrderReadsRepository {
  constructor(private readonly context: TenantContextService) {}

  /** A page of the edition's orders: those needing review first, and then the newest. */
  async list(editionId: string, query: OrderListQuery): Promise<OrderList> {
    const tx = this.context.tx()
    /** Whether a line of the order names the row: what "orders with this product" reads. */
    const holding = (column: PgColumn, id: string | undefined): SQL | undefined =>
      id === undefined
        ? undefined
        : exists(
            tx
              .select({ one: sql`1` })
              .from(orderLines)
              .where(and(eq(orderLines.orderId, orders.id), eq(column, id))),
          )
    const text = query.q === undefined ? undefined : part(query.q)
    const found = and(
      eq(orders.editionId, editionId),
      query.status === undefined ? undefined : eq(orders.status, query.status),
      query.from === undefined ? undefined : gte(orders.placedAt, new Date(query.from)),
      query.to === undefined ? undefined : lte(orders.placedAt, new Date(query.to)),
      holding(orderLines.ticketTypeId, query.ticketTypeId),
      holding(orderLines.addOnId, query.addOnId),
      holding(orderLines.merchandiseItemId, query.itemId),
      holding(orderLines.merchandiseVariantId, query.variantId),
      text === undefined
        ? undefined
        : or(ilike(orders.number, text), ilike(orders.holderName, text), ilike(orders.email, text)),
      // The code an order carries now: one replaced by a changed email finds nothing.
      query.qrCodeHash === undefined
        ? undefined
        : exists(
            tx
              .select({ one: sql`1` })
              .from(orderQrCodeOrders)
              .innerJoin(orderQrCodes, eq(orderQrCodes.id, orderQrCodeOrders.qrCodeId))
              .where(
                and(
                  eq(orderQrCodeOrders.orderId, orders.id),
                  eq(orderQrCodes.editionId, editionId),
                  eq(orderQrCodes.codeHash, query.qrCodeHash),
                ),
              ),
          ),
    )
    const rows = await tx
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        email: orders.email,
        holderName: orders.holderName,
        totalMinor: orders.totalMinor,
        placedAt: orders.placedAt,
        manualReason: orders.manualReason,
        ticketType: ticketTypes.name,
      })
      .from(orders)
      // An order holds at most one ticket, so the join adds no row.
      .leftJoin(orderLines, and(eq(orderLines.orderId, orders.id), eq(orderLines.kind, 'ticket')))
      .leftJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .where(found)
      .orderBy(
        sql`(${orders.status} = 'needs-review') desc`,
        desc(orders.placedAt),
        desc(orders.id),
      )
      .limit(query.limit)
      .offset(query.offset)
    const [all] = await tx.select({ total: count() }).from(orders).where(found)
    const [review] = await tx
      .select({ needsReview: count() })
      .from(orders)
      .where(and(eq(orders.editionId, editionId), eq(orders.status, 'needs-review')))
    return {
      orders: rows.map((row): OrderSummary => ({ ...row, placedAt: row.placedAt.toISOString() })),
      total: all!.total,
      needsReview: review!.needsReview,
    }
  }

  /** The order with everything it keeps, or 404; one of another edition is no order of this path. */
  async get(editionId: string, orderId: string): Promise<OrderDetail> {
    if (!isUuid(orderId)) throw notFound('order')
    const tx = this.context.tx()
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.editionId, editionId), eq(orders.id, orderId)))
    if (!order) throw notFound('order')
    const of = <T extends { orderId: PgColumn }>(table: T) => eq(table.orderId, orderId)

    const lines = await tx
      .select({
        id: orderLines.id,
        kind: orderLines.kind,
        ticketType: ticketTypes.name,
        addOn: addOns.name,
        item: merchandiseItems.name,
        merchandiseItemId: orderLines.merchandiseItemId,
        variantId: orderLines.merchandiseVariantId,
        quantity: orderLines.quantity,
        unitAmountMinor: orderLines.unitAmountMinor,
        amountMinor: orderLines.amountMinor,
        handedOutAt: orderLines.handedOutAt,
      })
      .from(orderLines)
      .leftJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .leftJoin(addOns, eq(addOns.id, orderLines.addOnId))
      .leftJoin(merchandiseItems, eq(merchandiseItems.id, orderLines.merchandiseItemId))
      .where(of(orderLines))
      // The ticket, then its add-ons, then the merchandise, each as it was added.
      .orderBy(asc(orderLines.kind), asc(orderLines.createdAt), asc(orderLines.id))
    const labels = await this.variantLabels(lines.flatMap((line) => line.variantId ?? []))

    const answers = await tx
      .select({
        fieldId: orderCustomFieldAnswers.customFieldId,
        label: editionCustomFields.label,
        answer: orderCustomFieldAnswers.answer,
      })
      .from(orderCustomFieldAnswers)
      .innerJoin(
        editionCustomFields,
        eq(editionCustomFields.id, orderCustomFieldAnswers.customFieldId),
      )
      .where(of(orderCustomFieldAnswers))
      .orderBy(asc(editionCustomFields.position), asc(editionCustomFields.id))

    const consents = await tx
      .select({
        consentId: orderConsents.consentId,
        text: editionConsents.text,
        acceptedAt: orderConsents.acceptedAt,
        versionId: editionDocumentVersions.id,
        number: editionDocumentVersions.number,
        title: editionDocuments.title,
      })
      .from(orderConsents)
      .innerJoin(editionConsents, eq(editionConsents.id, orderConsents.consentId))
      .leftJoin(
        editionDocumentVersions,
        eq(editionDocumentVersions.id, orderConsents.documentVersionId),
      )
      .leftJoin(editionDocuments, eq(editionDocuments.id, editionDocumentVersions.documentId))
      .where(of(orderConsents))
      .orderBy(asc(editionConsents.position), asc(editionConsents.id))

    const attempts = await tx
      .select()
      .from(paymentAttempts)
      .where(of(paymentAttempts))
      .orderBy(asc(paymentAttempts.createdAt), asc(paymentAttempts.id))

    const emails = await tx
      .select({
        id: orderEmails.id,
        kind: orderEmails.kind,
        recipient: orderEmails.recipient,
        queuedAt: orderEmails.queuedAt,
        sentAt: orderEmails.sentAt,
        failedAttempts: orderEmails.failedAttempts,
      })
      .from(orderEmails)
      .where(of(orderEmails))
      .orderBy(asc(orderEmails.queuedAt), asc(orderEmails.id))

    const [code] = await tx
      .select({ id: orderQrCodeOrders.qrCodeId })
      .from(orderQrCodeOrders)
      .where(of(orderQrCodeOrders))
    const [owner] = await tx
      .select({ email: accounts.email })
      .from(orderAccounts)
      .innerJoin(accounts, eq(accounts.id, orderAccounts.accountId))
      .where(of(orderAccounts))

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      email: order.email,
      holderName: order.holderName,
      ageBand: order.ageBand,
      guardianConsentAcknowledgedAt: iso(order.guardianConsentAcknowledgedAt),
      totalMinor: order.totalMinor,
      // What the convention holds of the order's payments: one the provider returned to the
      // buyer is no part of it.
      paidMinor: attempts
        .filter((attempt) => attempt.moneyWith === 'convention')
        .reduce((sum, attempt) => sum + (attempt.paidAmountMinor ?? 0), 0),
      currency: order.currency,
      holds: order.holds,
      placedAt: order.placedAt.toISOString(),
      paidAt: iso(order.paidAt),
      manualReason: order.manualReason,
      note: order.note,
      reviewCause: order.reviewCause,
      canceledAt: iso(order.canceledAt),
      cancelReason: order.cancelReason,
      declinedAt: iso(order.declinedAt),
      declineReason: order.declineReason,
      hasQrCode: code !== undefined,
      account: owner?.email ?? null,
      lines: lines.map(({ ticketType, addOn, item, handedOutAt, ...line }) => ({
        ...line,
        name: ticketType ?? addOn ?? item ?? '',
        variant: line.variantId ? (labels.get(line.variantId) ?? []) : [],
        handedOutAt: iso(handedOutAt),
      })),
      answers,
      consents: consents.map(({ versionId, number, title, acceptedAt, ...consent }) => ({
        ...consent,
        acceptedAt: acceptedAt.toISOString(),
        document:
          versionId !== null && number !== null && title !== null
            ? { title, versionId, number }
            : null,
      })),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        provider: attempt.provider,
        status: attempt.status,
        amountMinor: attempt.amountMinor,
        paidAmountMinor: attempt.paidAmountMinor,
        startedAt: attempt.createdAt.toISOString(),
        paidAt: iso(attempt.paidAt),
        confirmedAt: iso(attempt.confirmedAt),
        moneyWith: attempt.moneyWith,
        failureReason: attempt.failureReason,
        failureCode: attempt.failureCode,
        failureMessage: attempt.failureMessage,
        information: attempt.information ?? {},
      })),
      emails: emails.map((email) => ({
        ...email,
        queuedAt: email.queuedAt.toISOString(),
        sentAt: iso(email.sentAt),
      })),
    }
  }

  /** The labels of each variant's values, in the order of its item's axes. */
  private async variantLabels(variantIds: string[]): Promise<Map<string, string[]>> {
    const labels = new Map<string, string[]>()
    if (variantIds.length === 0) return labels
    const rows = await this.context
      .tx()
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
      .where(inArray(merchandiseVariantValues.variantId, variantIds))
      .orderBy(asc(merchandiseOptionAxes.position), asc(merchandiseOptionAxes.id))
    for (const row of rows)
      labels.set(row.variantId, [...(labels.get(row.variantId) ?? []), row.label])
    return labels
  }
}
