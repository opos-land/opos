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
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'

/**
 * A custom field of an edition (docs/specs/0003-catalog.md): a short text the edition asks a
 * ticket holder for, required or not. A hidden one is no longer asked and stays on the orders
 * that answered it.
 */
export const editionCustomFields = pgTable(
  'edition_custom_fields',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    label: text().notNull(),
    isRequired: boolean().notNull(),
    position: integer().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('edition_custom_fields_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('edition_custom_fields_tenant_edition_position_idx').on(
      t.tenantId,
      t.editionId,
      t.position,
    ),
    foreignKey({
      name: 'edition_custom_fields_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('edition_custom_fields_label', sql`char_length(btrim(${t.label})) between 1 and 100`),
    check('edition_custom_fields_position', sql`${t.position} >= 1`),
  ],
)
