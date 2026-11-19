import { Injectable } from '@nestjs/common'
import {
  type DocumentKind,
  type EditionDocument,
  MAX_DOCUMENT_VERSIONS,
  MAX_EDITION_DOCUMENTS,
  type UpdateDocument,
} from '@opos/contract'
import { editionConsents, editionDocuments, editionDocumentVersions, uploadedFiles } from '@opos/db'
import { and, asc, count, desc, eq, exists, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'
import { tooManyDocuments, tooManyVersions } from './shop.errors'

const columns = {
  id: editionDocuments.id,
  editionId: editionDocuments.editionId,
  kind: editionDocuments.kind,
  title: editionDocuments.title,
  hiddenAt: editionDocuments.hiddenAt,
}

interface Row {
  id: string
  editionId: string
  kind: DocumentKind
  title: string
  hiddenAt: Date | null
}

/**
 * The legal documents of the editions of the tenant in context, with their versions; RLS keeps
 * every query inside the tenant, and every document is looked up within the edition of the path,
 * whose permission the request was checked against.
 */
@Injectable()
export class DocumentsRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(editionDocuments.editionId, editionId), eq(editionDocuments.id, id))
  }

  /** The documents as the panel shows them, each with its versions from the newest. */
  private async withVersions(rows: Row[]): Promise<EditionDocument[]> {
    if (rows.length === 0) return []
    const versions = await this.context
      .tx()
      .select({
        documentId: editionDocumentVersions.documentId,
        id: editionDocumentVersions.id,
        number: editionDocumentVersions.number,
        publishedAt: editionDocumentVersions.publishedAt,
        name: uploadedFiles.name,
        size: uploadedFiles.size,
      })
      .from(editionDocumentVersions)
      .innerJoin(uploadedFiles, eq(uploadedFiles.id, editionDocumentVersions.fileId))
      .where(
        inArray(
          editionDocumentVersions.documentId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(desc(editionDocumentVersions.number))
    const byDocument = Map.groupBy(versions, (version) => version.documentId)
    return rows.map(({ hiddenAt, ...row }) => ({
      ...row,
      hidden: hiddenAt !== null,
      versions: (byDocument.get(row.id) ?? []).map((version) => ({
        id: version.id,
        number: version.number,
        publishedAt: version.publishedAt.toISOString(),
        file: { name: version.name, size: version.size },
      })),
    }))
  }

  async list(editionId: string): Promise<EditionDocument[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(editionDocuments)
      .where(eq(editionDocuments.editionId, editionId))
      // By kind, in the order the kinds are declared, then as they were added.
      .orderBy(
        asc(editionDocuments.kind),
        asc(editionDocuments.createdAt),
        asc(editionDocuments.id),
      )
    return this.withVersions(rows)
  }

  /** The document, or 404; one of another edition or another tenant is no document of this path. */
  async get(editionId: string, id: string): Promise<EditionDocument> {
    if (!isUuid(id)) throw notFound('document')
    const rows = await this.context
      .tx()
      .select(columns)
      .from(editionDocuments)
      .where(this.inEdition(editionId, id))
    const [document] = await this.withVersions(rows)
    if (!document) throw notFound('document')
    return document
  }

  /** Whether the edition holds the document: what a consent may link. */
  async holds(editionId: string, id: string): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ id: editionDocuments.id })
      .from(editionDocuments)
      .where(this.inEdition(editionId, id))
    return row !== undefined
  }

  async create(
    editionId: string,
    values: { kind: DocumentKind; title: string },
  ): Promise<EditionDocument> {
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const [held] = await this.context
      .tx()
      .select({ documents: count() })
      .from(editionDocuments)
      .where(eq(editionDocuments.editionId, editionId))
    if (held!.documents >= MAX_EDITION_DOCUMENTS) throw tooManyDocuments()
    const rows = await this.context
      .tx()
      .insert(editionDocuments)
      .values({ tenantId: this.context.tenant().id, editionId, ...values })
      .returning(columns)
    return (await this.withVersions(rows))[0]!
  }

  /** A document hidden again keeps the moment it was first hidden at. */
  async update(editionId: string, id: string, changes: UpdateDocument): Promise<EditionDocument> {
    const { title, hidden } = changes
    if (title !== undefined || hidden !== undefined) {
      await this.context
        .tx()
        .update(editionDocuments)
        .set({
          ...(title !== undefined && { title }),
          ...(hidden !== undefined && {
            hiddenAt: hidden ? sql`coalesce(${editionDocuments.hiddenAt}, now())` : null,
          }),
        })
        .where(this.inEdition(editionId, id))
    }
    return this.get(editionId, id)
  }

  /**
   * Publishes a file just kept as the next version of the document, numbered after its newest.
   * The row is never changed afterwards: no role may update it.
   */
  async publish(editionId: string, documentId: string, fileId: string) {
    const [held] = await this.context
      .tx()
      .select({ versions: count(), newest: max(editionDocumentVersions.number) })
      .from(editionDocumentVersions)
      .where(eq(editionDocumentVersions.documentId, documentId))
    if (held!.versions >= MAX_DOCUMENT_VERSIONS) throw tooManyVersions()
    await this.context
      .tx()
      .insert(editionDocumentVersions)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        documentId,
        number: (held!.newest ?? 0) + 1,
        fileId,
      })
  }

  /** Whether a consent links the document: while one does, the document stays. */
  async linked(documentId: string): Promise<boolean> {
    const [consent] = await this.context
      .tx()
      .select({ id: editionConsents.id })
      .from(editionConsents)
      .where(eq(editionConsents.documentId, documentId))
      .limit(1)
    return consent !== undefined
  }

  /**
   * Deletes the document, its versions with it, and answers the files they pointed at, for the
   * caller to release in the same transaction.
   */
  async remove(editionId: string, id: string): Promise<string[]> {
    const files = await this.context
      .tx()
      .select({ fileId: editionDocumentVersions.fileId })
      .from(editionDocumentVersions)
      .where(
        and(
          eq(editionDocumentVersions.editionId, editionId),
          eq(editionDocumentVersions.documentId, id),
        ),
      )
    await this.context.tx().delete(editionDocuments).where(this.inEdition(editionId, id))
    return files.map((file) => file.fileId)
  }

  /**
   * The kinds the edition has a published version of: those of its documents the shop shows that
   * hold a version. Without `except`, the document a change is about to hide or delete.
   */
  async publishedKinds(editionId: string, except?: string): Promise<Set<DocumentKind>> {
    const tx = this.context.tx()
    const rows = await tx
      .selectDistinct({ kind: editionDocuments.kind })
      .from(editionDocuments)
      .where(
        and(
          eq(editionDocuments.tenantId, this.context.tenant().id),
          eq(editionDocuments.editionId, editionId),
          isNull(editionDocuments.hiddenAt),
          except === undefined ? undefined : ne(editionDocuments.id, except),
          exists(
            tx
              .select({ id: editionDocumentVersions.id })
              .from(editionDocumentVersions)
              .where(eq(editionDocumentVersions.documentId, editionDocuments.id)),
          ),
        ),
      )
    return new Set(rows.map((row) => row.kind))
  }

  /**
   * The file of a published version and the edition it belongs to, for the route that serves it to
   * anyone. The query names the tenant itself besides RLS, since what it answers decides which
   * file anyone may read: a version of another tenant is none.
   */
  async versionFile(
    tenantId: string,
    versionId: string,
  ): Promise<{ fileId: string; editionId: string } | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        fileId: editionDocumentVersions.fileId,
        editionId: editionDocumentVersions.editionId,
      })
      .from(editionDocumentVersions)
      .where(
        and(
          eq(editionDocumentVersions.tenantId, tenantId),
          eq(editionDocumentVersions.id, versionId),
        ),
      )
    return row
  }
}
