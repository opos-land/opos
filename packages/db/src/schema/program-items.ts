import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'

export const programItems = pgTable(
  'program_items',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    title: text().notNull(),
    description: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('program_items_id_tenant_unique').on(t.id, t.tenantId),
    index('program_items_tenant_edition_starts_idx').on(t.tenantId, t.editionId, t.startsAt),
    foreignKey({
      name: 'program_items_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('program_items_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)
