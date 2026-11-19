import { Injectable } from '@nestjs/common'
import {
  type CreateCustomField,
  type CustomField,
  MAX_CUSTOM_FIELDS,
  type UpdateCustomField,
} from '@opos/contract'
import { editionCustomFields } from '@opos/db'
import { and, asc, eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { moved } from '../../common/order'
import { isUuid } from '../../common/uuid'
import { limitReached } from './catalog.errors'
import { arrange, hiddenAt, orderOf } from './places'

const columns = {
  id: editionCustomFields.id,
  editionId: editionCustomFields.editionId,
  label: editionCustomFields.label,
  isRequired: editionCustomFields.isRequired,
  position: editionCustomFields.position,
  hiddenAt: editionCustomFields.hiddenAt,
}

type Row = Omit<CustomField, 'hidden'> & { hiddenAt: Date | null }

const toField = ({ hiddenAt: hidden, ...row }: Row): CustomField => ({
  ...row,
  hidden: hidden !== null,
})

/**
 * The custom fields of the editions of the tenant in context, in their order; RLS keeps every
 * query inside the tenant, and every field is looked up within the edition of the path, whose
 * permission the request was checked against.
 */
@Injectable()
export class CustomFieldsRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(editionCustomFields.editionId, editionId), eq(editionCustomFields.id, id))
  }

  async list(editionId: string): Promise<CustomField[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(editionCustomFields)
      .where(eq(editionCustomFields.editionId, editionId))
      .orderBy(asc(editionCustomFields.position), asc(editionCustomFields.id))
    return rows.map(toField)
  }

  /** The field, or 404; one of another edition or another tenant is no field of this path. */
  async get(editionId: string, id: string): Promise<CustomField> {
    if (!isUuid(id)) throw notFound('custom field')
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(editionCustomFields)
      .where(this.inEdition(editionId, id))
    if (!row) throw notFound('custom field')
    return toField(row)
  }

  /** A new field takes the last place of the list. */
  async create(editionId: string, values: CreateCustomField): Promise<CustomField> {
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const held = await orderOf(this.context.tx(), editionCustomFields, editionId)
    if (held.length >= MAX_CUSTOM_FIELDS) throw limitReached(MAX_CUSTOM_FIELDS)
    const [row] = await this.context
      .tx()
      .insert(editionCustomFields)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        ...values,
        position: held.length + 1,
      })
      .returning(columns)
    return toField(row!)
  }

  /** A field hidden again keeps the moment it was first hidden at. */
  async update(editionId: string, id: string, changes: UpdateCustomField): Promise<CustomField> {
    const { position, hidden, ...fields } = changes
    if (Object.keys(fields).length > 0 || hidden !== undefined) {
      await this.context
        .tx()
        .update(editionCustomFields)
        .set({
          ...fields,
          ...(hidden !== undefined && { hiddenAt: hiddenAt(editionCustomFields.hiddenAt, hidden) }),
        })
        .where(this.inEdition(editionId, id))
    }
    if (position !== undefined) {
      const tx = this.context.tx()
      const order = await orderOf(tx, editionCustomFields, editionId)
      await arrange(tx, editionCustomFields, editionId, moved(order, id, position))
    }
    return this.get(editionId, id)
  }

  /** Deletes the field, and the rest close ranks. */
  async remove(editionId: string, id: string) {
    const tx = this.context.tx()
    await tx.delete(editionCustomFields).where(this.inEdition(editionId, id))
    await arrange(
      tx,
      editionCustomFields,
      editionId,
      await orderOf(tx, editionCustomFields, editionId),
    )
  }
}
