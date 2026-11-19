import { foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { editions } from './editions'

/**
 * The shop of an edition, one row an edition (docs/specs/0002-shop-setup.md): when it was opened,
 * empty while it is closed, and the settings the later specs of the tickets module add. An
 * edition with no row has a closed shop with nothing set.
 */
export const editionShops = pgTable(
  'edition_shops',
  {
    editionId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    openedAt: timestamp({ withTimezone: true }),
    faqUrl: text(),
    ...timestamps,
  },
  (t) => [
    index('edition_shops_tenant_idx').on(t.tenantId),
    foreignKey({
      name: 'edition_shops_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
  ],
)
