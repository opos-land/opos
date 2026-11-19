import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { uploadedFiles } from './uploaded-files'

/** What a legal document of an edition is; opening the shop asks for the first two. */
export const editionDocumentKind = pgEnum('edition_document_kind', [
  'shop-terms',
  'privacy-policy',
  'edition-rules',
  'other',
])

/**
 * A legal document of an edition (docs/specs/0002-shop-setup.md): its kind, its title and, in
 * edition_document_versions, the files it was published as. A hidden one leaves the shop and stays
 * on the orders that accepted it.
 */
export const editionDocuments = pgTable(
  'edition_documents',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    kind: editionDocumentKind().notNull(),
    title: text().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // What a version and a consent point at: the document within its tenant and its edition.
    unique('edition_documents_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('edition_documents_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'edition_documents_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('edition_documents_title', sql`char_length(btrim(${t.title})) between 1 and 200`),
  ],
)

/**
 * A version of a document: an uploaded file, published once and never changed. A changed document
 * is a new version, numbered from 1 within its document; an order keeps the version its buyer
 * accepted. The row is added, and goes only with its document.
 */
export const editionDocumentVersions = pgTable(
  'edition_document_versions',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    documentId: uuid().notNull(),
    number: integer().notNull(),
    fileId: uuid().notNull(),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('edition_document_versions_document_number_unique').on(t.documentId, t.number),
    // What an order points at: the version its buyer accepted, within its tenant and edition.
    unique('edition_document_versions_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('edition_document_versions_tenant_document_idx').on(t.tenantId, t.documentId),
    foreignKey({
      name: 'edition_document_versions_document_fk',
      columns: [t.documentId, t.tenantId, t.editionId],
      foreignColumns: [editionDocuments.id, editionDocuments.tenantId, editionDocuments.editionId],
    }).onDelete('cascade'),
    // The file is the version's own edition's, never another edition's or the convention's. No
    // cascade: a published version keeps its file for as long as it is there. Deferred to the end
    // of the transaction in the privileges migration, so that an edition goes with both.
    foreignKey({
      name: 'edition_document_versions_file_fk',
      columns: [t.fileId, t.tenantId, t.editionId],
      foreignColumns: [uploadedFiles.id, uploadedFiles.tenantId, uploadedFiles.editionId],
    }),
    check('edition_document_versions_number', sql`${t.number} >= 1`),
  ],
)

/**
 * A consent of an edition: the sentence a buyer accepts, the document it links when it links one,
 * whether it is required, and its place in the list. A hidden one leaves the shop and stays on the
 * orders that accepted it.
 */
export const editionConsents = pgTable(
  'edition_consents',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    documentId: uuid(),
    text: text().notNull(),
    isRequired: boolean().notNull(),
    position: integer().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // What an order points at: the consent its buyer accepted, within its tenant and edition.
    unique('edition_consents_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('edition_consents_tenant_edition_position_idx').on(t.tenantId, t.editionId, t.position),
    foreignKey({
      name: 'edition_consents_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    // No cascade: a document a consent links stays until the consent lets go of it. Deferred to
    // the end of the transaction in the privileges migration, so that an edition goes with both.
    foreignKey({
      name: 'edition_consents_document_fk',
      columns: [t.documentId, t.tenantId, t.editionId],
      foreignColumns: [editionDocuments.id, editionDocuments.tenantId, editionDocuments.editionId],
    }),
    check('edition_consents_text', sql`char_length(btrim(${t.text})) between 1 and 1000`),
    check('edition_consents_position', sql`${t.position} >= 1`),
  ],
)
