import { Injectable } from '@nestjs/common'
import { type AddOn, type CreateAddOn, MAX_ADD_ONS, type UpdateAddOn } from '@opos/contract'
import { addOns } from '@opos/db'
import { and, asc, eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { moved } from '../../common/order'
import { isUuid } from '../../common/uuid'
import { limitReached } from './catalog.errors'
import { arrange, hiddenAt, orderOf } from './places'

const columns = {
  id: addOns.id,
  editionId: addOns.editionId,
  name: addOns.name,
  description: addOns.description,
  amountMinor: addOns.amountMinor,
  kind: addOns.kind,
  capacity: addOns.capacity,
  placesLeftThreshold: addOns.placesLeftThreshold,
  position: addOns.position,
  hiddenAt: addOns.hiddenAt,
}

type Row = Omit<AddOn, 'hidden'> & { hiddenAt: Date | null }

const toAddOn = ({ hiddenAt: hidden, ...row }: Row): AddOn => ({ ...row, hidden: hidden !== null })

/**
 * The add-ons of the editions of the tenant in context, in their order; RLS keeps every query
 * inside the tenant, and every add-on is looked up within the edition of the path, whose
 * permission the request was checked against.
 */
@Injectable()
export class AddOnsRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(addOns.editionId, editionId), eq(addOns.id, id))
  }

  async list(editionId: string): Promise<AddOn[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(addOns)
      .where(eq(addOns.editionId, editionId))
      .orderBy(asc(addOns.position), asc(addOns.id))
    return rows.map(toAddOn)
  }

  /** The add-on, or 404; one of another edition or another tenant is no add-on of this path. */
  async get(editionId: string, id: string): Promise<AddOn> {
    if (!isUuid(id)) throw notFound('add-on')
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(addOns)
      .where(this.inEdition(editionId, id))
    if (!row) throw notFound('add-on')
    return toAddOn(row)
  }

  /** A new add-on takes the last place of the list. */
  async create(editionId: string, values: CreateAddOn): Promise<AddOn> {
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const held = await orderOf(this.context.tx(), addOns, editionId)
    if (held.length >= MAX_ADD_ONS) throw limitReached(MAX_ADD_ONS)
    const [row] = await this.context
      .tx()
      .insert(addOns)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        name: values.name,
        description: values.description ?? '',
        amountMinor: values.amountMinor,
        kind: values.kind,
        capacity: values.capacity ?? null,
        placesLeftThreshold: values.placesLeftThreshold ?? null,
        position: held.length + 1,
      })
      .returning(columns)
    return toAddOn(row!)
  }

  /** An add-on hidden again keeps the moment it was first hidden at. */
  async update(editionId: string, id: string, changes: UpdateAddOn): Promise<AddOn> {
    const { position, hidden, ...fields } = changes
    if (Object.keys(fields).length > 0 || hidden !== undefined) {
      await this.context
        .tx()
        .update(addOns)
        .set({
          ...fields,
          ...(hidden !== undefined && { hiddenAt: hiddenAt(addOns.hiddenAt, hidden) }),
        })
        .where(this.inEdition(editionId, id))
    }
    if (position !== undefined) {
      const tx = this.context.tx()
      await arrange(
        tx,
        addOns,
        editionId,
        moved(await orderOf(tx, addOns, editionId), id, position),
      )
    }
    return this.get(editionId, id)
  }

  /** Deletes the add-on, what offers it with it, and the rest close ranks. */
  async remove(editionId: string, id: string) {
    const tx = this.context.tx()
    await tx.delete(addOns).where(this.inEdition(editionId, id))
    await arrange(tx, addOns, editionId, await orderOf(tx, addOns, editionId))
  }
}
