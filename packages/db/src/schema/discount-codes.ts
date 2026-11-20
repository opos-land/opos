import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { addOns } from './add-ons'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { merchandiseItems } from './merchandise'
import { ticketTypes } from './ticket-types'

/** What a discount code takes off: a percent of what it applies to, or an amount. */
export const discountCodeKind = pgEnum('discount_code_kind', ['percent', 'amount'])

/**
 * A discount code of an edition (docs/specs/0008-discount-codes.md): a text a buyer enters at the
 * Summary, kept in lower case and read without regard to case. It lowers the lines it applies to
 * together, within its validity window, for as many orders as its limit lets hold it at a time.
 * One an order used is never deleted: an org ends it.
 */
export const discountCodes = pgTable(
  'discount_codes',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    code: text().notNull(),
    kind: discountCodeKind().notNull(),
    percent: integer(),
    amountMinor: integer(),
    /** How many orders may hold the code at a time; empty for no limit. */
    usageLimit: integer(),
    validFrom: timestamp({ withTimezone: true }).notNull(),
    validUntil: timestamp({ withTimezone: true }).notNull(),
    /** Set by an org to stop the code before its window does. */
    endedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('discount_codes_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    unique('discount_codes_edition_code_unique').on(t.editionId, t.code),
    index('discount_codes_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'discount_codes_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('discount_codes_code', sql`${t.code} ~ '^[a-z0-9-]{4,40}$'`),
    // A percent code has a percent and an amount code an amount, and neither has both. Each
    // side says "is not null" itself: a check that comes to null would let the row in.
    check(
      'discount_codes_value',
      sql`(${t.kind} = 'percent' and ${t.percent} is not null and ${t.percent} between 1 and 100 and ${t.amountMinor} is null) or (${t.kind} = 'amount' and ${t.amountMinor} is not null and ${t.amountMinor} between 1 and 100000000 and ${t.percent} is null)`,
    ),
    check('discount_codes_usage_limit', sql`${t.usageLimit} >= 1`),
    check('discount_codes_window', sql`${t.validUntil} > ${t.validFrom}`),
  ],
)

const link = { tenantId: uuid().notNull(), editionId: uuid().notNull() }

/** The ticket types a discount code applies to. */
export const discountCodeTicketTypes = pgTable(
  'discount_code_ticket_types',
  { ...link, discountCodeId: uuid().notNull(), ticketTypeId: uuid().notNull() },
  (t) => [
    primaryKey({
      name: 'discount_code_ticket_types_pkey',
      columns: [t.discountCodeId, t.ticketTypeId],
    }),
    index('discount_code_ticket_types_tenant_idx').on(t.tenantId, t.discountCodeId),
    foreignKey({
      name: 'discount_code_ticket_types_code_fk',
      columns: [t.discountCodeId, t.tenantId, t.editionId],
      foreignColumns: [discountCodes.id, discountCodes.tenantId, discountCodes.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'discount_code_ticket_types_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
  ],
)

/** The add-ons a discount code applies to. */
export const discountCodeAddOns = pgTable(
  'discount_code_add_ons',
  { ...link, discountCodeId: uuid().notNull(), addOnId: uuid().notNull() },
  (t) => [
    primaryKey({ name: 'discount_code_add_ons_pkey', columns: [t.discountCodeId, t.addOnId] }),
    index('discount_code_add_ons_tenant_idx').on(t.tenantId, t.discountCodeId),
    foreignKey({
      name: 'discount_code_add_ons_code_fk',
      columns: [t.discountCodeId, t.tenantId, t.editionId],
      foreignColumns: [discountCodes.id, discountCodes.tenantId, discountCodes.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'discount_code_add_ons_add_on_fk',
      columns: [t.addOnId, t.tenantId, t.editionId],
      foreignColumns: [addOns.id, addOns.tenantId, addOns.editionId],
    }).onDelete('cascade'),
  ],
)

/** The merchandise items a discount code applies to, in every variant. */
export const discountCodeMerchandiseItems = pgTable(
  'discount_code_merchandise_items',
  { ...link, discountCodeId: uuid().notNull(), merchandiseItemId: uuid().notNull() },
  (t) => [
    primaryKey({
      name: 'discount_code_merchandise_items_pkey',
      columns: [t.discountCodeId, t.merchandiseItemId],
    }),
    index('discount_code_merchandise_items_tenant_idx').on(t.tenantId, t.discountCodeId),
    foreignKey({
      name: 'discount_code_merchandise_items_code_fk',
      columns: [t.discountCodeId, t.tenantId, t.editionId],
      foreignColumns: [discountCodes.id, discountCodes.tenantId, discountCodes.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'discount_code_merchandise_items_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }).onDelete('cascade'),
  ],
)
