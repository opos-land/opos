import { Injectable } from '@nestjs/common'
import {
  accounts,
  addOns,
  editionDocuments,
  editionDocumentVersions,
  editions,
  editionShops,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseVariantValues,
  orderAccounts,
  orderConsents,
  orderEmails,
  orderLines,
  orderLinks,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  paymentAttempts,
  tenants,
  ticketTypes,
} from '@opos/db'
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { type KeptEmail } from './kept-email'
import { type OrderEmailKind } from './orders.repository'

/** An email the outbox took to send. */
export interface ClaimedEmail {
  id: string
  kind: OrderEmailKind
  recipient: string
  orderId: string
  failedAttempts: number
  queuedAt: Date
}

/**
 * The emails of the orders of the tenant of the open transaction, and what each is written from;
 * RLS keeps every query inside the tenant.
 */
@Injectable()
export class OrderEmailsRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * Takes an email that is due, for this process alone until `until`: its row is claimed under a
   * lock another process skips, and its next try moved past the time a send may take. A send that
   * never reports back is so tried again, and no two processes send one email at once.
   */
  async claim(emailId: string, now: Date, until: Date): Promise<ClaimedEmail | undefined> {
    const tx = this.context.tx()
    const [email] = await tx
      .select({
        id: orderEmails.id,
        kind: orderEmails.kind,
        recipient: orderEmails.recipient,
        orderId: orderEmails.orderId,
        failedAttempts: orderEmails.failedAttempts,
        queuedAt: orderEmails.queuedAt,
      })
      .from(orderEmails)
      .where(
        and(
          eq(orderEmails.id, emailId),
          isNull(orderEmails.sentAt),
          isNull(orderEmails.withdrawnAt),
          lte(orderEmails.nextAttemptAt, now),
        ),
      )
      .for('update', { skipLocked: true })
    if (!email) return undefined
    await tx.update(orderEmails).set({ nextAttemptAt: until }).where(eq(orderEmails.id, emailId))
    return email
  }

  /** An email that went out, with what is kept of what it said. */
  async sent(emailId: string, at: Date, said: KeptEmail) {
    await this.context
      .tx()
      .update(orderEmails)
      .set({ sentAt: at, subject: said.subject, body: said.body })
      .where(eq(orderEmails.id, emailId))
  }

  /** A send that failed is tried again at `next`, and counted. */
  async failed(emailId: string, next: Date) {
    await this.context
      .tx()
      .update(orderEmails)
      .set({ failedAttempts: sql`${orderEmails.failedAttempts} + 1`, nextAttemptAt: next })
      .where(eq(orderEmails.id, emailId))
  }

  /** An email not sent because the order left its address before it went out. */
  async withdraw(emailId: string, at: Date) {
    await this.context
      .tx()
      .update(orderEmails)
      .set({ withdrawnAt: at })
      .where(eq(orderEmails.id, emailId))
  }

  /**
   * The order with its edition and its convention, as an email names them. Its row is locked
   * until the email is written: a change of the order's email waits, and then ends the link
   * this email was given.
   */
  async order(orderId: string) {
    const [row] = await this.context
      .tx()
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        editionId: orders.editionId,
        number: orders.number,
        status: orders.status,
        email: orders.email,
        holderName: orders.holderName,
        ageBand: orders.ageBand,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        editionSlug: editions.slug,
        editionName: editions.name,
        editionEndsAt: editions.endsAt,
        conventionName: tenants.name,
        conventionSlug: tenants.slug,
        conventionLocale: tenants.defaultLocale,
      })
      .from(orders)
      .innerJoin(editions, eq(editions.id, orders.editionId))
      .innerJoin(tenants, eq(tenants.id, orders.tenantId))
      .where(eq(orders.id, orderId))
      .for('update', { of: orders })
    return row
  }

  /**
   * The lines of the order under the names of what they sell, a variant with its values, the
   * ticket first.
   */
  async lines(orderId: string) {
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
      })
      .from(orderLines)
      .leftJoin(ticketTypes, eq(ticketTypes.id, orderLines.ticketTypeId))
      .leftJoin(addOns, eq(addOns.id, orderLines.addOnId))
      .leftJoin(merchandiseItems, eq(merchandiseItems.id, orderLines.merchandiseItemId))
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.kind), asc(orderLines.id))
    const values = await tx
      .select({
        variantId: merchandiseVariantValues.variantId,
        label: merchandiseOptionValues.label,
      })
      .from(orderLines)
      .innerJoin(
        merchandiseVariantValues,
        eq(merchandiseVariantValues.variantId, orderLines.merchandiseVariantId),
      )
      .innerJoin(
        merchandiseOptionValues,
        eq(merchandiseOptionValues.id, merchandiseVariantValues.optionValueId),
      )
      .innerJoin(
        merchandiseOptionAxes,
        eq(merchandiseOptionAxes.id, merchandiseVariantValues.axisId),
      )
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(merchandiseOptionAxes.position))
    return rows.map((row) => {
      const labels = values
        .filter((value) => value.variantId === row.variantId)
        .map((value) => value.label)
      const name = row.ticketType ?? row.addOn ?? row.item ?? ''
      return {
        kind: row.kind,
        name: labels.length > 0 ? `${name} (${labels.join(', ')})` : name,
        quantity: row.quantity,
        amountMinor: row.amountMinor,
      }
    })
  }

  /** The versions of the documents the order's consents accepted, each under its title. */
  documents(orderId: string) {
    return this.context
      .tx()
      .selectDistinct({ title: editionDocuments.title, versionId: editionDocumentVersions.id })
      .from(orderConsents)
      .innerJoin(
        editionDocumentVersions,
        eq(editionDocumentVersions.id, orderConsents.documentVersionId),
      )
      .innerJoin(editionDocuments, eq(editionDocuments.id, editionDocumentVersions.documentId))
      .where(eq(orderConsents.orderId, orderId))
      .orderBy(asc(editionDocuments.title))
  }

  /** The address of the edition's guardian consent form, when it set one. */
  async guardianFormUrl(editionId: string): Promise<string | null> {
    const [row] = await this.context
      .tx()
      .select({ url: editionShops.guardianConsentFormUrl })
      .from(editionShops)
      .where(eq(editionShops.editionId, editionId))
    return row?.url ?? null
  }

  /** What the edition's reminder tells: its opening hours, its pick-up and its consent form. */
  async reminderOf(editionId: string) {
    const [row] = await this.context
      .tx()
      .select({
        openingHours: editionShops.openingHours,
        pickupInformation: editionShops.pickupInformation,
        guardianFormUrl: editionShops.guardianConsentFormUrl,
      })
      .from(editionShops)
      .where(eq(editionShops.editionId, editionId))
    return row ?? { openingHours: null, pickupInformation: null, guardianFormUrl: null }
  }

  /** The QR code of the order, sealed, with the identifier it is sealed for. */
  async qrCode(orderId: string): Promise<{ id: string; code: string } | undefined> {
    const [row] = await this.context
      .tx()
      .select({ id: orderQrCodes.id, code: orderQrCodes.code })
      .from(orderQrCodeOrders)
      .innerJoin(orderQrCodes, eq(orderQrCodes.id, orderQrCodeOrders.qrCodeId))
      .where(eq(orderQrCodeOrders.orderId, orderId))
    return row
  }

  /**
   * The orders on the QR code the order carries, itself among them, the earliest placed first:
   * whether and when each was paid, its email, and the age band of the one that holds the
   * ticket. It picks who gets a QR code, so it names the order's tenant and edition itself.
   */
  async codeOrders(order: { tenantId: string; editionId: string; id: string }) {
    const inEdition = and(
      eq(orderQrCodeOrders.tenantId, order.tenantId),
      eq(orderQrCodeOrders.editionId, order.editionId),
    )
    const carried = this.context
      .tx()
      .select({ qrCodeId: orderQrCodeOrders.qrCodeId })
      .from(orderQrCodeOrders)
      .where(and(inEdition, eq(orderQrCodeOrders.orderId, order.id)))
    return this.context
      .tx()
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        editionId: orders.editionId,
        status: orders.status,
        email: orders.email,
        ageBand: orders.ageBand,
        paidAt: orders.paidAt,
        holdsTicket: sql<boolean>`exists (select 1 from ${orderLines} where ${orderLines.orderId} = ${orders.id} and ${orderLines.kind} = 'ticket')`,
      })
      .from(orderQrCodeOrders)
      .innerJoin(orders, eq(orders.id, orderQrCodeOrders.orderId))
      .where(and(inEdition, inArray(orderQrCodeOrders.qrCodeId, carried)))
      .orderBy(asc(orders.placedAt), asc(orders.id))
  }

  /** Queues an email of the order to the address, for the outbox to send. */
  async queue(
    order: { tenantId: string; editionId: string; id: string },
    kind: OrderEmailKind,
    recipient: string,
  ) {
    await this.context.tx().insert(orderEmails).values({
      tenantId: order.tenantId,
      editionId: order.editionId,
      orderId: order.id,
      kind,
      recipient,
    })
  }

  /** An order link for the order: only the hash of its token is kept. */
  async addLink(
    order: { tenantId: string; editionId: string; id: string },
    tokenHash: string,
    expiresAt: Date,
  ) {
    await this.context.tx().insert(orderLinks).values({
      tenantId: order.tenantId,
      editionId: order.editionId,
      orderId: order.id,
      tokenHash,
      expiresAt,
    })
  }

  /**
   * The language of the account whose confirmed address this is, and whether the order is on
   * that account, or undefined when no account confirmed the address: such an address is
   * written to in the convention's language.
   */
  async account(
    email: string,
    orderId: string,
  ): Promise<{ locale: string | null; holdsOrder: boolean } | undefined> {
    const tx = this.context.tx()
    // A query of its own names each column with its table; one written into the list of fields
    // would lose the tables' names, and compare whichever columns answer to the bare ones.
    const onAccount = tx
      .select({ one: sql`1` })
      .from(orderAccounts)
      .where(and(eq(orderAccounts.orderId, orderId), eq(orderAccounts.accountId, accounts.id)))
    const [row] = await tx
      .select({ locale: accounts.locale, holdsOrder: sql<boolean>`${exists(onAccount)}` })
      .from(accounts)
      .where(and(sql`lower(${accounts.email}) = ${email}`, isNotNull(accounts.emailConfirmedAt)))
    return row
  }

  /** The payment confirmed last for the order: what its emails say of a payment. */
  async lastPayment(orderId: string) {
    const [row] = await this.context
      .tx()
      .select({
        provider: paymentAttempts.provider,
        paidAmountMinor: paymentAttempts.paidAmountMinor,
        moneyWith: paymentAttempts.moneyWith,
        providerReference: paymentAttempts.providerReference,
      })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, orderId), isNotNull(paymentAttempts.confirmedAt)))
      .orderBy(desc(paymentAttempts.confirmedAt))
      .limit(1)
    return row
  }
}
