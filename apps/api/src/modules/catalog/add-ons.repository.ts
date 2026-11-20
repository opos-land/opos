import { Injectable } from '@nestjs/common'
import { type AddOn, type CreateAddOn, MAX_ADD_ONS, type UpdateAddOn } from '@opos/contract'
import { addOnPictures, addOns, editions, uploadedFiles } from '@opos/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
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
  pictureFileId: addOnPictures.fileId,
  pictureWidth: uploadedFiles.width,
  pictureHeight: uploadedFiles.height,
}

type Row = Omit<AddOn, 'hidden' | 'picture'> & {
  hiddenAt: Date | null
  pictureFileId: string | null
  pictureWidth: number | null
  pictureHeight: number | null
}

const toAddOn = ({
  hiddenAt: hidden,
  pictureFileId,
  pictureWidth,
  pictureHeight,
  ...row
}: Row): AddOn => ({
  ...row,
  hidden: hidden !== null,
  // An image always has its width and height: they are read from the picture as it is kept.
  picture:
    pictureFileId && pictureWidth && pictureHeight
      ? { fileId: pictureFileId, width: pictureWidth, height: pictureHeight }
      : null,
})

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

  /** The add-ons, each with the picture it has. */
  private listed() {
    return this.context
      .tx()
      .select(columns)
      .from(addOns)
      .leftJoin(addOnPictures, eq(addOnPictures.addOnId, addOns.id))
      .leftJoin(uploadedFiles, eq(uploadedFiles.id, addOnPictures.fileId))
  }

  async list(editionId: string): Promise<AddOn[]> {
    const rows = await this.listed()
      .where(eq(addOns.editionId, editionId))
      .orderBy(asc(addOns.position), asc(addOns.id))
    return rows.map(toAddOn)
  }

  /** The add-on, or 404; one of another edition or another tenant is no add-on of this path. */
  async get(editionId: string, id: string): Promise<AddOn> {
    if (!isUuid(id)) throw notFound('add-on')
    const [row] = await this.listed().where(this.inEdition(editionId, id))
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
      .returning({ id: addOns.id })
    return this.get(editionId, row!.id)
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

  /** Takes away the picture of the add-on of the edition; answers its file, or none. */
  async clearPicture(editionId: string, id: string): Promise<string | undefined> {
    const [gone] = await this.context
      .tx()
      .delete(addOnPictures)
      .where(and(eq(addOnPictures.editionId, editionId), eq(addOnPictures.addOnId, id)))
      .returning({ fileId: addOnPictures.fileId })
    return gone?.fileId
  }

  /** A file just kept as the picture of an add-on that has none. */
  async setPicture(editionId: string, id: string, fileId: string) {
    await this.context
      .tx()
      .insert(addOnPictures)
      .values({ tenantId: this.context.tenant().id, editionId, addOnId: id, fileId })
  }

  /**
   * The file of the picture of one of the edition's add-ons, hidden ones too. Anything else is no
   * file of this route. The identifier is the one the row holds: a uuid reads the same in either
   * case, and the bucket's keys do not.
   */
  async pictureFile(editionId: string, fileId: string): Promise<string | undefined> {
    const [picture] = await this.context
      .tx()
      .select({ fileId: addOnPictures.fileId })
      .from(addOnPictures)
      .where(and(eq(addOnPictures.editionId, editionId), eq(addOnPictures.fileId, fileId)))
    return picture?.fileId
  }

  /**
   * The file of an add-on's picture that is for everyone: of an add-on that is not hidden, of a
   * published edition. The query names the tenant itself besides RLS, since what it answers
   * decides which file anyone may read. The identifier is the one the row holds, as in
   * `pictureFile`.
   */
  async shownPictureFile(
    tenantId: string,
    fileId: string,
  ): Promise<{ fileId: string; editionId: string } | undefined> {
    const [picture] = await this.context
      .tx()
      .select({ fileId: addOnPictures.fileId, editionId: addOnPictures.editionId })
      .from(addOnPictures)
      .innerJoin(addOns, eq(addOns.id, addOnPictures.addOnId))
      .innerJoin(editions, eq(editions.id, addOns.editionId))
      .where(
        and(
          eq(addOnPictures.fileId, fileId),
          eq(addOns.tenantId, tenantId),
          isNull(addOns.hiddenAt),
          eq(editions.isPublished, true),
        ),
      )
    return picture
  }
}
