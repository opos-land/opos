import { Injectable } from '@nestjs/common'
import {
  type Consent,
  type CreateConsent,
  MAX_EDITION_CONSENTS,
  type UpdateConsent,
} from '@opos/contract'
import { editionConsents, orderConsents } from '@opos/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { moved } from '../../common/order'
import { isUuid } from '../../common/uuid'
import { tooManyConsents } from './shop.errors'

const columns = {
  id: editionConsents.id,
  editionId: editionConsents.editionId,
  documentId: editionConsents.documentId,
  text: editionConsents.text,
  isRequired: editionConsents.isRequired,
  position: editionConsents.position,
  hiddenAt: editionConsents.hiddenAt,
}

/**
 * A consent as its row holds it. Whether an order accepted it is read apart, by the routes that
 * answer it: the shop's offer lists the consents on every read and has no use for it.
 */
export type StoredConsent = Omit<Consent, 'accepted'>

type Row = Omit<StoredConsent, 'hidden'> & { hiddenAt: Date | null }

const toConsent = ({ hiddenAt, ...row }: Row): StoredConsent => ({
  ...row,
  hidden: hiddenAt !== null,
})

/**
 * The consents of the editions of the tenant in context, in their order; RLS keeps every query
 * inside the tenant, and every consent is looked up within the edition of the path, whose
 * permission the request was checked against. The document a consent links is set with its row,
 * checked by the caller, and never changed: the application role updates no column that points at
 * another row. The foreign key keeps the document inside the consent's own tenant and edition.
 */
@Injectable()
export class ConsentsRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(editionConsents.editionId, editionId), eq(editionConsents.id, id))
  }

  private async rows(editionId: string): Promise<Row[]> {
    return this.context
      .tx()
      .select(columns)
      .from(editionConsents)
      .where(eq(editionConsents.editionId, editionId))
      .orderBy(asc(editionConsents.position), asc(editionConsents.createdAt))
  }

  async list(editionId: string): Promise<StoredConsent[]> {
    return (await this.rows(editionId)).map(toConsent)
  }

  /** The consent, or 404; one of another edition or another tenant is no consent of this path. */
  async get(editionId: string, id: string): Promise<StoredConsent> {
    if (!isUuid(id)) throw notFound('consent')
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(editionConsents)
      .where(this.inEdition(editionId, id))
    if (!row) throw notFound('consent')
    return toConsent(row)
  }

  /** A new consent takes the last place of the list. */
  async create(editionId: string, values: CreateConsent): Promise<StoredConsent> {
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const held = await this.rows(editionId)
    if (held.length >= MAX_EDITION_CONSENTS) throw tooManyConsents()
    const [row] = await this.context
      .tx()
      .insert(editionConsents)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        documentId: values.documentId ?? null,
        text: values.text,
        isRequired: values.isRequired,
        position: (held.at(-1)?.position ?? 0) + 1,
      })
      .returning(columns)
    return toConsent(row!)
  }

  /** The consents of the edition that an order accepted. */
  async accepted(editionId: string): Promise<Set<string>> {
    const rows = await this.context
      .tx()
      .selectDistinct({ id: orderConsents.consentId })
      .from(orderConsents)
      .where(eq(orderConsents.editionId, editionId))
    return new Set(rows.map((row) => row.id))
  }

  /** Whether an order accepted the consent. */
  async isAccepted(editionId: string, id: string): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ id: orderConsents.consentId })
      .from(orderConsents)
      .where(and(eq(orderConsents.editionId, editionId), eq(orderConsents.consentId, id)))
      .limit(1)
    return row !== undefined
  }

  /**
   * Locks the consent's row against an order that accepts it: one accepting it at this moment
   * holds the row for its foreign key and is waited for, and none accepts it before the caller's
   * transaction ends. What the caller reads of its orders next is what holds.
   */
  async lock(editionId: string, id: string) {
    await this.context
      .tx()
      .select({ id: editionConsents.id })
      .from(editionConsents)
      .where(this.inEdition(editionId, id))
      .for('update')
  }

  /** A consent hidden again keeps the moment it was first hidden at. */
  async update(editionId: string, id: string, changes: UpdateConsent): Promise<StoredConsent> {
    const { position, hidden, ...fields } = changes
    if (Object.keys(fields).length > 0 || hidden !== undefined) {
      await this.context
        .tx()
        .update(editionConsents)
        .set({
          ...fields,
          ...(hidden !== undefined && {
            hiddenAt: hidden ? sql`coalesce(${editionConsents.hiddenAt}, now())` : null,
          }),
        })
        .where(this.inEdition(editionId, id))
    }
    if (position !== undefined) {
      const order = (await this.rows(editionId)).map((row) => row.id)
      await this.arrange(editionId, moved(order, id, position))
    }
    return this.get(editionId, id)
  }

  /** Deletes the consent, and the rest close ranks; answers whether it was there. */
  async remove(editionId: string, id: string): Promise<boolean> {
    const gone = await this.context
      .tx()
      .delete(editionConsents)
      .where(this.inEdition(editionId, id))
      .returning({ id: editionConsents.id })
    if (gone.length === 0) return false
    await this.arrange(
      editionId,
      (await this.rows(editionId)).map((row) => row.id),
    )
    return true
  }

  /** Gives the consents the places of `order`, counted from 1; a row already in its place stays. */
  private async arrange(editionId: string, order: readonly string[]) {
    const held = new Map((await this.rows(editionId)).map((row) => [row.id, row.position]))
    for (const [index, id] of order.entries()) {
      if (held.get(id) === index + 1) continue
      await this.context
        .tx()
        .update(editionConsents)
        .set({ position: index + 1 })
        .where(this.inEdition(editionId, id))
    }
  }
}
