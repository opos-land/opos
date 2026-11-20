import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { addOns } from './add-ons'
import { id, timestamps } from './columns'
import { discountCodes } from './discount-codes'
import { editionCustomFields } from './edition-custom-fields'
import { editionConsents, editionDocumentVersions } from './edition-documents'
import { editions } from './editions'
import { merchandiseItems, merchandiseVariants } from './merchandise'
import { type PaymentProvider } from './payment-provider-accounts'
import { scannerDevices } from './scanner-devices'
import { ticketTypes } from './ticket-types'

/**
 * Where an order stands (docs/specs/0004-checkout-and-orders.md, Order statuses). It changes only
 * as that table says; the changes an org makes are order management's.
 */
export const orderStatus = pgEnum('order_status', [
  'awaiting-payment',
  'paid',
  'paid-manual',
  'expired',
  'needs-review',
  'declined',
  'canceled',
])

/**
 * Why an org recorded an order in the panel: a sale at the desk, one paid by invoice, or a
 * complimentary one.
 */
export const manualOrderReason = pgEnum('manual_order_reason', ['desk', 'invoice', 'complimentary'])

/**
 * Why an order needs review: its payment was of another amount than its total, or it came once
 * what the order had held was no longer available.
 */
export const orderReviewCause = pgEnum('order_review_cause', ['amount', 'unavailable'])

/** The age band of a ticket holder, by their age on the edition's first day. */
export const ageBand = pgEnum('age_band', ['child', 'teen', 'adult'])

/** What a line of an order sells. A discount takes off; the discount codes spec adds its row. */
export const orderLineKind = pgEnum('order_line_kind', [
  'ticket',
  'add_on',
  'merchandise',
  'discount',
])

/**
 * An order: one checkout of an edition with its payment, at most one ticket for one ticket holder
 * with its add-ons and merchandise. It keeps the prices it was placed at and the data of its
 * ticket holder, which are the convention's and never an account's. It is never deleted while its
 * edition stands, and so its edition stands while it has one.
 */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    /** Ten characters that are not mistaken for one another, unique in the convention. */
    number: text().notNull(),
    status: orderStatus().notNull(),
    /** The buyer's address, in lower case; empty for a manual order. */
    email: text(),
    holderName: text().notNull(),
    /** Empty for a merch-only order, which has no ticket holder to place in a band. */
    ageBand: ageBand(),
    totalMinor: integer().notNull(),
    currency: text().notNull().default('PLN'),
    /** Whether its lines count against stock and capacity. */
    holds: boolean().notNull(),
    /** When the hold of an order awaiting payment ends. */
    holdEndsAt: timestamp({ withTimezone: true }),
    placedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp({ withTimezone: true }),
    guardianConsentAcknowledgedAt: timestamp({ withTimezone: true }),
    providerConsentAcceptedAt: timestamp({ withTimezone: true }),
    /** The hash of the token that opens the order's result page, for a day from its placing. */
    resultTokenHash: text().notNull(),
    /** The discount code the order used; its discount line carries the amount taken off. */
    discountCodeId: uuid(),
    /**
     * The order a "Buy more" order was started from: once paid, it joins the QR code that order
     * carries.
     */
    extendsOrderId: uuid(),
    /** Set for an order an org recorded in the panel, which nobody placed in the shop. */
    manualReason: manualOrderReason(),
    /** What the org noted of a manual order. */
    note: text(),
    /** Why the order needed review; it stays once the order is settled. */
    reviewCause: orderReviewCause(),
    canceledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    declinedAt: timestamp({ withTimezone: true }),
    declineReason: text(),
    ...timestamps,
  },
  (t) => [
    unique('orders_tenant_number_unique').on(t.tenantId, t.number),
    // What a line, an attempt and everything else of an order points at.
    unique('orders_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('orders_tenant_edition_status_idx').on(t.tenantId, t.editionId, t.status),
    index('orders_tenant_email_idx').on(t.tenantId, t.email),
    index('orders_tenant_extends_idx').on(t.tenantId, t.extendsOrderId),
    // No cascade: an order outlives everything but a decision to purge it, so an edition that has
    // one is not deleted, and neither is its convention.
    foreignKey({
      name: 'orders_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }),
    // The digits and letters left once those mistaken for one another are gone: no 0, O, 1, I, L.
    check('orders_number', sql`${t.number} ~ '^[2-9A-HJKMNP-Z]{10}$'`),
    check('orders_total', sql`${t.totalMinor} >= 0`),
    check('orders_currency', sql`${t.currency} = 'PLN'`),
    // An order of the shop is somebody's; a manual order asks for no name.
    check(
      'orders_holder_name',
      sql`char_length(${t.holderName}) <= 200 and (${t.manualReason} is not null or char_length(btrim(${t.holderName})) >= 1)`,
    ),
    // No cascade: a code an order used is ended, never deleted.
    foreignKey({
      name: 'orders_discount_code_fk',
      columns: [t.discountCodeId, t.tenantId, t.editionId],
      foreignColumns: [discountCodes.id, discountCodes.tenantId, discountCodes.editionId],
    }),
    // An order extends an order of its own edition, and so of its own tenant. No cascade: the
    // two go together, with their edition.
    foreignKey({
      name: 'orders_extends_fk',
      columns: [t.extendsOrderId, t.tenantId, t.editionId],
      foreignColumns: [t.id, t.tenantId, t.editionId],
    }),
    check('orders_extends_another', sql`${t.extendsOrderId} <> ${t.id}`),
    // A manual order has a reason and nobody's email: an org recorded it at the desk.
    check(
      'orders_manual_reason',
      sql`${t.status} <> 'paid-manual' or ${t.manualReason} is not null`,
    ),
    check('orders_manual_no_email', sql`${t.manualReason} is null or ${t.email} is null`),
    check('orders_note', sql`char_length(${t.note}) <= 500`),
    check('orders_cancel_reason', sql`char_length(btrim(${t.cancelReason})) between 1 and 500`),
    check('orders_decline_reason', sql`char_length(btrim(${t.declineReason})) between 1 and 500`),
    check(
      'orders_email',
      sql`${t.email} = lower(${t.email}) and ${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' and char_length(${t.email}) <= 254`,
    ),
  ],
)

/**
 * A line of an order: what it sells, how many and at which price, kept whatever the catalog does
 * later. The row of the catalog it names stays for as long as the line does. A partial unique
 * index holds an order to one ticket.
 */
export const orderLines = pgTable(
  'order_lines',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    kind: orderLineKind().notNull(),
    ticketTypeId: uuid(),
    addOnId: uuid(),
    merchandiseItemId: uuid(),
    merchandiseVariantId: uuid(),
    quantity: integer().notNull(),
    unitAmountMinor: integer().notNull(),
    amountMinor: integer().notNull(),
    /** Empty until the scanner or an org marks the line as handed over. */
    handedOutAt: timestamp({ withTimezone: true }),
    /** The scanner that marked it; empty for a mark an org made in the panel. */
    handedOutBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_lines_tenant_order_idx').on(t.tenantId, t.orderId),
    // What counting the lines that hold a limit reads by.
    index('order_lines_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId),
    index('order_lines_tenant_add_on_idx').on(t.tenantId, t.addOnId),
    index('order_lines_tenant_variant_idx').on(t.tenantId, t.merchandiseVariantId),
    uniqueIndex('order_lines_one_ticket')
      .on(t.orderId)
      .where(sql`${t.kind} = 'ticket'`),
    // An order takes one code, so one line carries what it took off.
    uniqueIndex('order_lines_one_discount')
      .on(t.orderId)
      .where(sql`${t.kind} = 'discount'`),
    foreignKey({
      name: 'order_lines_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    // No cascade on what a line sells: a row an order holds is hidden, never deleted.
    foreignKey({
      name: 'order_lines_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }),
    foreignKey({
      name: 'order_lines_add_on_fk',
      columns: [t.addOnId, t.tenantId, t.editionId],
      foreignColumns: [addOns.id, addOns.tenantId, addOns.editionId],
    }),
    foreignKey({
      name: 'order_lines_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }),
    foreignKey({
      name: 'order_lines_variant_fk',
      columns: [t.merchandiseVariantId, t.tenantId, t.editionId, t.merchandiseItemId],
      foreignColumns: [
        merchandiseVariants.id,
        merchandiseVariants.tenantId,
        merchandiseVariants.editionId,
        merchandiseVariants.merchandiseItemId,
      ],
    }),
    foreignKey({
      name: 'order_lines_handed_out_by_fk',
      columns: [t.handedOutBy, t.tenantId, t.editionId],
      foreignColumns: [scannerDevices.id, scannerDevices.tenantId, scannerDevices.editionId],
    }),
    // Only a line handed out names who handed it out.
    check(
      'order_lines_handed_out_by',
      sql`${t.handedOutBy} is null or ${t.handedOutAt} is not null`,
    ),
    // A line names what its kind sells, and nothing else.
    check(
      'order_lines_sells',
      sql`(${t.ticketTypeId} is not null) = (${t.kind} = 'ticket') and (${t.addOnId} is not null) = (${t.kind} = 'add_on') and (${t.merchandiseVariantId} is not null) = (${t.kind} = 'merchandise') and (${t.merchandiseItemId} is not null) = (${t.kind} = 'merchandise')`,
    ),
    // What a line sells costs nothing or more; what a code takes off is nothing or less.
    check(
      'order_lines_amount',
      sql`(${t.kind} = 'discount' and ${t.amountMinor} <= 0) or (${t.kind} <> 'discount' and ${t.amountMinor} >= 0)`,
    ),
    check(
      'order_lines_quantity',
      sql`${t.quantity} >= 1 and (${t.kind} = 'merchandise' or ${t.quantity} = 1)`,
    ),
  ],
)

/** The answer an order gave to a custom field of its edition: the convention's data. */
export const orderCustomFieldAnswers = pgTable(
  'order_custom_field_answers',
  {
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    customFieldId: uuid().notNull(),
    answer: text().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'order_custom_field_answers_pkey',
      columns: [t.orderId, t.customFieldId],
    }),
    index('order_custom_field_answers_tenant_order_idx').on(t.tenantId, t.orderId),
    foreignKey({
      name: 'order_custom_field_answers_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    // No cascade: a field an order answered is hidden, never deleted.
    foreignKey({
      name: 'order_custom_field_answers_field_fk',
      columns: [t.customFieldId, t.tenantId, t.editionId],
      foreignColumns: [
        editionCustomFields.id,
        editionCustomFields.tenantId,
        editionCustomFields.editionId,
      ],
    }),
    check(
      'order_custom_field_answers_answer',
      sql`char_length(btrim(${t.answer})) between 1 and 200`,
    ),
  ],
)

/**
 * A consent an order accepted, with the exact version of the document it links and the moment.
 * The consent stays for as long as the order does.
 */
export const orderConsents = pgTable(
  'order_consents',
  {
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    consentId: uuid().notNull(),
    documentVersionId: uuid(),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'order_consents_pkey', columns: [t.orderId, t.consentId] }),
    index('order_consents_tenant_order_idx').on(t.tenantId, t.orderId),
    foreignKey({
      name: 'order_consents_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_consents_consent_fk',
      columns: [t.consentId, t.tenantId, t.editionId],
      foreignColumns: [editionConsents.id, editionConsents.tenantId, editionConsents.editionId],
    }),
    foreignKey({
      name: 'order_consents_version_fk',
      columns: [t.documentVersionId, t.tenantId, t.editionId],
      foreignColumns: [
        editionDocumentVersions.id,
        editionDocumentVersions.tenantId,
        editionDocumentVersions.editionId,
      ],
    }),
  ],
)

/**
 * The account an order is attached to: the one it was placed with, or the one whose confirmed
 * email it was paid under. A row of its own, added once, so that no role updates a column
 * pointing at an account; it goes with the account, and the order stays with the convention.
 */
export const orderAccounts = pgTable(
  'order_accounts',
  {
    orderId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    accountId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_accounts_tenant_account_idx').on(t.tenantId, t.accountId),
    foreignKey({
      name: 'order_accounts_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_accounts_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
  ],
)

/**
 * A QR code: the credential of a paid order, read by the scanner. It is found by its hash; the
 * code itself is sealed with a key the API alone holds, since the order's page and a resent email
 * show it again.
 */
export const orderQrCodes = pgTable(
  'order_qr_codes',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    codeHash: text().notNull(),
    code: text().notNull(),
    /** Set once another code took its place; a replaced code opens nothing. */
    replacedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('order_qr_codes_code_hash_unique').on(t.codeHash),
    unique('order_qr_codes_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('order_qr_codes_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'order_qr_codes_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('order_qr_codes_code', sql`${t.code} <> ''`),
  ],
)

/**
 * The QR code an order carries: one an order, which several orders of an edition may share. A row
 * of its own, added once, so that no role updates a column pointing at another row.
 */
export const orderQrCodeOrders = pgTable(
  'order_qr_code_orders',
  {
    orderId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    qrCodeId: uuid().notNull(),
  },
  (t) => [
    index('order_qr_code_orders_tenant_code_idx').on(t.tenantId, t.qrCodeId),
    foreignKey({
      name: 'order_qr_code_orders_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_qr_code_orders_code_fk',
      columns: [t.qrCodeId, t.tenantId, t.editionId],
      foreignColumns: [orderQrCodes.id, orderQrCodes.tenantId, orderQrCodes.editionId],
    }).onDelete('cascade'),
  ],
)

/** What a provider's module said of an attempt, as the order moved through it. */
export const paymentAttemptStatus = pgEnum('payment_attempt_status', [
  'started',
  'paid',
  'failed',
  'ended',
  'refused',
])

/** Where the money of a payment is. */
export const paymentMoneyWith = pgEnum('payment_money_with', ['convention', 'buyer'])

/** Why an attempt failed, as a buyer reads it: one of the shop's own short list. */
export const paymentFailureReason = pgEnum('payment_failure_reason', [
  'declined',
  'insufficient-funds',
  'wrong-code',
  'timed-out',
  'canceled',
  'failed',
])

/**
 * One try at paying an order through its provider. It keeps what the provider's module said of
 * it, for the orgs, and nothing of a buyer's card or bank account.
 */
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    provider: text().$type<PaymentProvider>().notNull(),
    status: paymentAttemptStatus().notNull(),
    /** What the order asked for. */
    amountMinor: integer().notNull(),
    /** What the provider confirmed, which may differ. */
    paidAmountMinor: integer(),
    paidAt: timestamp({ withTimezone: true }),
    confirmedAt: timestamp({ withTimezone: true }),
    moneyWith: paymentMoneyWith(),
    providerReference: text(),
    failureReason: paymentFailureReason(),
    /** The provider's own code and words, for the orgs alone. */
    failureCode: text(),
    failureMessage: text(),
    information: jsonb().$type<Record<string, string>>(),
    ...timestamps,
  },
  (t) => [
    index('payment_attempts_tenant_order_idx').on(t.tenantId, t.orderId),
    foreignKey({
      name: 'payment_attempts_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    check('payment_attempts_provider', sql`${t.provider} in ('fake', 'przelewy24')`),
    check('payment_attempts_amount', sql`${t.amountMinor} >= 1`),
  ],
)

/** What an order sends: each email has a fixed text and is queued once by its cause. */
export const orderEmailKind = pgEnum('order_email_kind', [
  'order-confirmation',
  'order-expired',
  'payment-under-review',
  'needs-review',
  'payment-not-needed',
  'payment-not-needed-orgs',
  // An org corrected the ticket holder's name, or swapped a variant of a merchandise line.
  'order-holder-changed',
  'order-variant-changed',
  // An org changed the order's email: to the new address, with the new QR code and order link.
  'order-email-changed',
  // The same change, to the old address: a notice that its QR code and link no longer work.
  'order-email-replaced',
  'order-declined',
  'order-canceled',
  // A fresh order link for one that expired, to the order's email.
  'order-link',
  // The reminder a few days before the edition, with the QR code.
  'pre-edition-reminder',
])

/**
 * An email of an order: the list of what the order sent, and the outbox it is sent from. A row is
 * queued in the transaction of its cause and sent afterwards, again after a failure, so that no
 * email is lost to a failed send.
 */
export const orderEmails = pgTable(
  'order_emails',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    kind: orderEmailKind().notNull(),
    recipient: text().notNull(),
    queuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    failedAttempts: integer().notNull().default(0),
    /** When the outbox tries it next: at once, then later after each failure. */
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /**
     * Set instead of a send for an email that would hand the order over, with its QR code and a
     * link, to an address the order has left since it was queued.
     */
    withdrawnAt: timestamp({ withTimezone: true }),
    /**
     * What it said, kept as it is sent: its subject and its text, written in the convention's
     * language, without the QR code and the token of the order link, which only its recipient
     * sees, and with no word of an account (docs/specs/0006-order-management.md, F4). Empty for
     * one sent before texts were kept.
     */
    subject: text(),
    body: text(),
  },
  (t) => [
    index('order_emails_tenant_order_idx').on(t.tenantId, t.orderId),
    // The list of an edition's emails, the newest first.
    index('order_emails_edition_queued_idx').on(t.tenantId, t.editionId, t.queuedAt),
    // What the outbox reads: the emails not sent yet, by when they are due.
    index('order_emails_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.sentAt} is null`),
    foreignKey({
      name: 'order_emails_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
    check('order_emails_recipient', sql`${t.recipient} <> ''`),
    check('order_emails_failed_attempts', sql`${t.failedAttempts} >= 0`),
    check('order_emails_said', sql`(${t.subject} is null) = (${t.body} is null)`),
    check('order_emails_said_once_sent', sql`${t.body} is null or ${t.sentAt} is not null`),
  ],
)

/**
 * A link that opens one order without a sign-in: the hash of its token, until it expires or is
 * ended.
 */
export const orderLinks = pgTable(
  'order_links',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    orderId: uuid().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('order_links_token_hash_unique').on(t.tokenHash),
    index('order_links_tenant_order_idx').on(t.tenantId, t.orderId),
    foreignKey({
      name: 'order_links_order_fk',
      columns: [t.orderId, t.tenantId, t.editionId],
      foreignColumns: [orders.id, orders.tenantId, orders.editionId],
    }).onDelete('cascade'),
  ],
)
