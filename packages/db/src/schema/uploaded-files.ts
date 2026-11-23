import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
import { editions } from './editions'
import { fileColumns, fileConstraints } from './files'
import { tenants } from './tenants'

/**
 * A convention's file, or one of its editions' where `edition_id` is set. A feature's table points
 * at it by `(id, tenant_id)`.
 */
export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    ...fileColumns(),
    tenantId: uuid().notNull(),
    editionId: uuid(),
  },
  (t) => [
    unique('uploaded_files_id_tenant_unique').on(t.id, t.tenantId),
    // What a row of an edition's own table points at: the file within its tenant and its edition.
    unique('uploaded_files_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('uploaded_files_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'uploaded_files_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'uploaded_files_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    ...fileConstraints('uploaded_files', t),
  ],
)
