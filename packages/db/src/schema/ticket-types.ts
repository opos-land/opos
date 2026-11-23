import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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

/**
 * A ticket type of an edition (docs/specs/0003-catalog.md): what it is called, when it sells, how
 * many of it there are and whom it lets in. Its prices are in ticket_type_price_tiers. A hidden
 * one is no longer offered and stays on the orders that hold it.
 */
export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    name: text().notNull(),
    shortDescription: text().notNull().default(''),
    longDescription: text().notNull().default(''),
    /** Empty while the ticket type is not limited. */
    capacity: integer(),
    saleStartsAt: timestamp({ withTimezone: true }).notNull(),
    saleEndsAt: timestamp({ withTimezone: true }).notNull(),
    allowsChild: boolean().notNull(),
    allowsTeen: boolean().notNull(),
    allowsAdult: boolean().notNull(),
    discountsExcluded: boolean().notNull().default(false),
    /** Outside its sale window the shop shows it as not yet on sale or as closed, or hides it. */
    shownOutsideSaleWindow: boolean().notNull().default(false),
    position: integer().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // What its tiers, prices, perks and offers point at: the ticket type within its edition.
    unique('ticket_types_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('ticket_types_tenant_edition_position_idx').on(t.tenantId, t.editionId, t.position),
    foreignKey({
      name: 'ticket_types_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('ticket_types_name', sql`char_length(btrim(${t.name})) between 1 and 100`),
    check('ticket_types_short_description', sql`char_length(${t.shortDescription}) <= 300`),
    check('ticket_types_long_description', sql`char_length(${t.longDescription}) <= 5000`),
    check('ticket_types_capacity', sql`${t.capacity} >= 0`),
    check('ticket_types_sale_window', sql`${t.saleEndsAt} > ${t.saleStartsAt}`),
    check('ticket_types_age_bands', sql`${t.allowsChild} or ${t.allowsTeen} or ${t.allowsAdult}`),
    check('ticket_types_position', sql`${t.position} >= 1`),
  ],
)

/**
 * A price tier: the price of a ticket type from one moment until another. The windows of one
 * ticket type never overlap, by the exclusion constraint of the privileges migration; a tier is
 * replaced with its ticket type's whole list and never changed.
 */
export const ticketTypePriceTiers = pgTable(
  'ticket_type_price_tiers',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    ticketTypeId: uuid().notNull(),
    amountMinor: integer().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index('ticket_type_price_tiers_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId),
    foreignKey({
      name: 'ticket_type_price_tiers_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
    check('ticket_type_price_tiers_amount', sql`${t.amountMinor} between 0 and 100000000`),
    check('ticket_type_price_tiers_window', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

/** A supporter price: a fixed amount a buyer may choose instead of the tier's price. */
export const ticketTypeSupporterPrices = pgTable(
  'ticket_type_supporter_prices',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    ticketTypeId: uuid().notNull(),
    amountMinor: integer().notNull(),
  },
  (t) => [
    unique('ticket_type_supporter_prices_amount_unique').on(t.ticketTypeId, t.amountMinor),
    index('ticket_type_supporter_prices_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId),
    foreignKey({
      name: 'ticket_type_supporter_prices_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
    check('ticket_type_supporter_prices_amount', sql`${t.amountMinor} between 1 and 100000000`),
  ],
)

/** A perk: something the ticket type includes, shown to the buyer and never sold separately. */
export const ticketTypePerks = pgTable(
  'ticket_type_perks',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    ticketTypeId: uuid().notNull(),
    name: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    index('ticket_type_perks_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId, t.position),
    foreignKey({
      name: 'ticket_type_perks_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
    check('ticket_type_perks_name', sql`char_length(btrim(${t.name})) between 1 and 100`),
    check('ticket_type_perks_position', sql`${t.position} >= 1`),
  ],
)

/** An add-on offered with a ticket type: both of one tenant and one edition. */
export const ticketTypeAddOns = pgTable(
  'ticket_type_add_ons',
  {
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    ticketTypeId: uuid().notNull(),
    addOnId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: 'ticket_type_add_ons_pkey', columns: [t.ticketTypeId, t.addOnId] }),
    index('ticket_type_add_ons_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId),
    index('ticket_type_add_ons_tenant_add_on_idx').on(t.tenantId, t.addOnId),
    foreignKey({
      name: 'ticket_type_add_ons_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ticket_type_add_ons_add_on_fk',
      columns: [t.addOnId, t.tenantId, t.editionId],
      foreignColumns: [addOns.id, addOns.tenantId, addOns.editionId],
    }).onDelete('cascade'),
  ],
)

/** A merchandise item offered with a ticket type: both of one tenant and one edition. */
export const ticketTypeMerchandiseItems = pgTable(
  'ticket_type_merchandise_items',
  {
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    ticketTypeId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'ticket_type_merchandise_items_pkey',
      columns: [t.ticketTypeId, t.merchandiseItemId],
    }),
    index('ticket_type_merchandise_items_tenant_ticket_type_idx').on(t.tenantId, t.ticketTypeId),
    index('ticket_type_merchandise_items_tenant_item_idx').on(t.tenantId, t.merchandiseItemId),
    foreignKey({
      name: 'ticket_type_merchandise_items_ticket_type_fk',
      columns: [t.ticketTypeId, t.tenantId, t.editionId],
      foreignColumns: [ticketTypes.id, ticketTypes.tenantId, ticketTypes.editionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ticket_type_merchandise_items_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }).onDelete('cascade'),
  ],
)
