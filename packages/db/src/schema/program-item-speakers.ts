import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { id, timestamps } from './columns'
import { programItems } from './program-items'

export const programItemSpeakers = pgTable(
  'program_item_speakers',
  {
    id: id(),
    tenantId: uuid().notNull(),
    programItemId: uuid().notNull(),
    accountId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    // tenantId first: a row on another tenant's item answers the foreign key, whichever rows exist.
    unique('program_item_speakers_tenant_item_account_unique').on(
      t.tenantId,
      t.programItemId,
      t.accountId,
    ),
    index('program_item_speakers_account_idx').on(t.accountId),
    foreignKey({
      name: 'program_item_speakers_program_item_fk',
      columns: [t.programItemId, t.tenantId],
      foreignColumns: [programItems.id, programItems.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'program_item_speakers_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
  ],
)
