import { foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { uploadedFiles } from './uploaded-files'

/**
 * A convention's logo: the row points at the convention's own file, and is there only while the
 * convention has a logo. A replaced logo is a new row, never a changed one.
 */
export const tenantLogos = pgTable(
  'tenant_logos',
  {
    tenantId: uuid().primaryKey(),
    fileId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'tenant_logos_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tenant_logos_file_fk',
      columns: [t.fileId, t.tenantId],
      foreignColumns: [uploadedFiles.id, uploadedFiles.tenantId],
    }).onDelete('cascade'),
  ],
)
