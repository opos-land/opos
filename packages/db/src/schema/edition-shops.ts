import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { editions } from './editions'

/**
 * The shop of an edition, one row an edition (docs/specs/0002-shop-setup.md): when it was opened,
 * empty while it is closed, and what the edition sets for its whole catalog
 * (docs/specs/0003-catalog.md): the two ages that divide child, teen and adult, the address of the
 * guardian consent form, the pre-order deadline of its merchandise, whether it takes merch-only
 * orders and the message its shop shows while nothing is on sale. An edition with no row has a
 * closed shop with nothing set.
 */
export const editionShops = pgTable(
  'edition_shops',
  {
    editionId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    openedAt: timestamp({ withTimezone: true }),
    faqUrl: text(),
    /** The age a teen starts at, on the edition's first day; below it a ticket holder is a child. */
    teenFromAge: integer(),
    /** The age an adult starts at. */
    adultFromAge: integer(),
    guardianConsentFormUrl: text(),
    merchPreorderDeadline: timestamp({ withTimezone: true }),
    merchOnlyEnabled: boolean().notNull().default(false),
    salesClosedMessage: text(),
    /** Where and when merchandise is handed over, as the page of an order tells its buyer. */
    pickupInformation: text(),
    /** How many days before the edition's first day its reminder goes out; none while null. */
    reminderDaysBefore: integer(),
    /** When the edition is open, as an org writes it for the reminder. */
    openingHours: text(),
    /** When the reminder was queued: it goes out once an edition. */
    reminderSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('edition_shops_tenant_idx').on(t.tenantId),
    foreignKey({
      name: 'edition_shops_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    // Both ages or neither, the second above the first.
    check(
      'edition_shops_age_bands',
      sql`(${t.teenFromAge} is null) = (${t.adultFromAge} is null) and (${t.teenFromAge} is null or (${t.teenFromAge} >= 1 and ${t.adultFromAge} > ${t.teenFromAge} and ${t.adultFromAge} <= 150))`,
    ),
    check('edition_shops_sales_closed_message', sql`char_length(${t.salesClosedMessage}) <= 1000`),
    check('edition_shops_pickup_information', sql`char_length(${t.pickupInformation}) <= 1000`),
    check('edition_shops_reminder_days_before', sql`${t.reminderDaysBefore} between 1 and 60`),
    check('edition_shops_opening_hours', sql`char_length(${t.openingHours}) <= 1000`),
  ],
)
