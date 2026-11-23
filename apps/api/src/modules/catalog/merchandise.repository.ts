import { Injectable } from '@nestjs/common'
import {
  type CreateMerchandiseItem,
  MAX_ITEM_PICTURES,
  MAX_ITEM_VARIANTS,
  MAX_MERCHANDISE_ITEMS,
  type MerchandiseItem,
  type PutVariants,
  type UpdateMerchandiseItem,
} from '@opos/contract'
import {
  editions,
  merchandiseItemPictures,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseSizeCharts,
  merchandiseVariants,
  merchandiseVariantValues,
  uploadedFiles,
} from '@opos/db'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { type AnyPgColumn } from 'drizzle-orm/pg-core'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { moved } from '../../common/order'
import { isUuid } from '../../common/uuid'
import { invalidField, limitReached } from './catalog.errors'
import { PICTURE_KIND, SIZE_CHART_KIND } from '../files/kinds'
import { arrange, hiddenAt, orderOf } from './places'

const columns = {
  id: merchandiseItems.id,
  editionId: merchandiseItems.editionId,
  name: merchandiseItems.name,
  description: merchandiseItems.description,
  amountMinor: merchandiseItems.amountMinor,
  perOrderLimit: merchandiseItems.perOrderLimit,
  picturesIllustrative: merchandiseItems.picturesIllustrative,
  position: merchandiseItems.position,
  hiddenAt: merchandiseItems.hiddenAt,
}

type Axes = NonNullable<UpdateMerchandiseItem['axes']>
/** Axes to add: their names and the labels of their values, in order. */
type NewAxes = readonly { name: string; values: readonly { label: string }[] }[]

/** What names a variant among those of its item: its values, whatever order they came in. */
export const variantKey = (valueIds: readonly string[]) => [...valueIds].sort().join(' ')

/** The files a change let go of, for the caller to release in the same transaction. */
export interface ReleasedFiles {
  pictures: string[]
  sizeCharts: string[]
}

/**
 * The merchandise of the editions of the tenant in context; RLS keeps every query inside the
 * tenant, and every item is looked up within the edition of the path, whose permission the
 * request was checked against. An axis, a value, a variant, a picture and a size chart are found
 * inside their item.
 */
@Injectable()
export class MerchandiseRepository {
  constructor(private readonly context: TenantContextService) {}

  private at(editionId: string) {
    return { tenantId: this.context.tenant().id, editionId }
  }

  private inEdition(editionId: string, id: string) {
    return and(eq(merchandiseItems.editionId, editionId), eq(merchandiseItems.id, id))
  }

  /**
   * A row of the item, by its identifier. The caller found the identifier among the item's own
   * rows already; the statement names the item too, so that it holds whoever calls it.
   */
  private ofItem<Table extends { id: AnyPgColumn; merchandiseItemId: AnyPgColumn }>(
    table: Table,
    item: Pick<MerchandiseItem, 'id'>,
    id: string,
  ) {
    return and(eq(table.merchandiseItemId, item.id), eq(table.id, id))
  }

  /** The items as a screen shows them, each with its axes, its variants and its pictures. */
  private async assembled(
    rows: (Omit<MerchandiseItem, 'hidden' | 'axes' | 'variants' | 'pictures'> & {
      hiddenAt: Date | null
    })[],
  ): Promise<MerchandiseItem[]> {
    if (rows.length === 0) return []
    const tx = this.context.tx()
    const ids = rows.map((row) => row.id)
    const axes = await tx
      .select({
        id: merchandiseOptionAxes.id,
        itemId: merchandiseOptionAxes.merchandiseItemId,
        name: merchandiseOptionAxes.name,
      })
      .from(merchandiseOptionAxes)
      .where(inArray(merchandiseOptionAxes.merchandiseItemId, ids))
      .orderBy(asc(merchandiseOptionAxes.position), asc(merchandiseOptionAxes.id))
    const values = await tx
      .select({
        id: merchandiseOptionValues.id,
        axisId: merchandiseOptionValues.axisId,
        label: merchandiseOptionValues.label,
        fileId: merchandiseSizeCharts.fileId,
        width: uploadedFiles.width,
        height: uploadedFiles.height,
      })
      .from(merchandiseOptionValues)
      .leftJoin(
        merchandiseSizeCharts,
        eq(merchandiseSizeCharts.optionValueId, merchandiseOptionValues.id),
      )
      .leftJoin(uploadedFiles, eq(uploadedFiles.id, merchandiseSizeCharts.fileId))
      .where(inArray(merchandiseOptionValues.merchandiseItemId, ids))
      .orderBy(asc(merchandiseOptionValues.position), asc(merchandiseOptionValues.id))
    const variants = await tx
      .select({
        id: merchandiseVariants.id,
        itemId: merchandiseVariants.merchandiseItemId,
        stock: merchandiseVariants.stock,
        hiddenAt: merchandiseVariants.hiddenAt,
      })
      .from(merchandiseVariants)
      .where(inArray(merchandiseVariants.merchandiseItemId, ids))
      .orderBy(asc(merchandiseVariants.id))
    const variantValues = await tx
      .select({
        variantId: merchandiseVariantValues.variantId,
        axisId: merchandiseVariantValues.axisId,
        valueId: merchandiseVariantValues.optionValueId,
      })
      .from(merchandiseVariantValues)
      .where(inArray(merchandiseVariantValues.merchandiseItemId, ids))
    const pictures = await tx
      .select({
        id: merchandiseItemPictures.id,
        itemId: merchandiseItemPictures.merchandiseItemId,
        fileId: merchandiseItemPictures.fileId,
        width: uploadedFiles.width,
        height: uploadedFiles.height,
      })
      .from(merchandiseItemPictures)
      .innerJoin(uploadedFiles, eq(uploadedFiles.id, merchandiseItemPictures.fileId))
      .where(inArray(merchandiseItemPictures.merchandiseItemId, ids))
      .orderBy(asc(merchandiseItemPictures.position), asc(merchandiseItemPictures.id))

    const valuesOfAxis = Map.groupBy(values, (value) => value.axisId)
    const axesOfItem = Map.groupBy(axes, (axis) => axis.itemId)
    const valuesOfVariant = Map.groupBy(variantValues, (value) => value.variantId)
    const variantsOfItem = Map.groupBy(variants, (variant) => variant.itemId)
    const picturesOfItem = Map.groupBy(pictures, (picture) => picture.itemId)

    return rows.map(({ hiddenAt: hidden, ...row }) => {
      const itemAxes = (axesOfItem.get(row.id) ?? []).map((axis) => ({
        id: axis.id,
        name: axis.name,
        values: (valuesOfAxis.get(axis.id) ?? []).map((value) => ({
          id: value.id,
          label: value.label,
          sizeChart:
            value.fileId === null
              ? null
              : { fileId: value.fileId, width: value.width!, height: value.height! },
        })),
      }))
      // A variant is placed by its values, axis after axis, as the matrix of the item reads.
      const place = new Map(
        itemAxes.flatMap((axis) => axis.values.map((value, index) => [value.id, index])),
      )
      const itemVariants = (variantsOfItem.get(row.id) ?? [])
        .map((variant) => {
          const held = valuesOfVariant.get(variant.id) ?? []
          const valueIds = itemAxes.flatMap(
            (axis) => held.find((value) => value.axisId === axis.id)?.valueId ?? [],
          )
          return {
            id: variant.id,
            valueIds,
            stock: variant.stock,
            hidden: variant.hiddenAt !== null,
          }
        })
        .sort((a, b) => {
          for (const [index, valueId] of a.valueIds.entries()) {
            const difference = place.get(valueId)! - place.get(b.valueIds[index]!)!
            if (difference !== 0) return difference
          }
          return 0
        })
      return {
        ...row,
        hidden: hidden !== null,
        axes: itemAxes,
        variants: itemVariants,
        pictures: (picturesOfItem.get(row.id) ?? []).map((picture) => ({
          id: picture.id,
          fileId: picture.fileId,
          width: picture.width!,
          height: picture.height!,
        })),
      }
    })
  }

  async list(editionId: string): Promise<MerchandiseItem[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(merchandiseItems)
      .where(eq(merchandiseItems.editionId, editionId))
      .orderBy(asc(merchandiseItems.position), asc(merchandiseItems.id))
    return this.assembled(rows)
  }

  /** The item, or 404; one of another edition or another tenant is no item of this path. */
  async get(editionId: string, id: string): Promise<MerchandiseItem> {
    if (!isUuid(id)) throw notFound('merchandise item')
    const rows = await this.context
      .tx()
      .select(columns)
      .from(merchandiseItems)
      .where(this.inEdition(editionId, id))
    const [item] = await this.assembled(rows)
    if (!item) throw notFound('merchandise item')
    return item
  }

  private async addAxes(editionId: string, itemId: string, axes: NewAxes, from = 1) {
    const tx = this.context.tx()
    const of = { ...this.at(editionId), merchandiseItemId: itemId }
    for (const [index, axis] of axes.entries()) {
      const [made] = await tx
        .insert(merchandiseOptionAxes)
        .values({ ...of, name: axis.name, position: from + index })
        .returning({ id: merchandiseOptionAxes.id })
      await tx.insert(merchandiseOptionValues).values(
        axis.values.map((value, place) => ({
          ...of,
          axisId: made!.id,
          label: value.label,
          position: place + 1,
        })),
      )
    }
  }

  /** The one variant of an item without axes: out of stock until an org enters a number. */
  private async addBareVariant(editionId: string, itemId: string) {
    await this.context
      .tx()
      .insert(merchandiseVariants)
      .values({ ...this.at(editionId), merchandiseItemId: itemId, stock: 0 })
  }

  /** A new item takes the last place of the list. */
  async create(editionId: string, values: CreateMerchandiseItem): Promise<MerchandiseItem> {
    const tx = this.context.tx()
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const held = await orderOf(tx, merchandiseItems, editionId)
    if (held.length >= MAX_MERCHANDISE_ITEMS) throw limitReached(MAX_MERCHANDISE_ITEMS)
    const { axes = [], ...fields } = values
    const [row] = await tx
      .insert(merchandiseItems)
      .values({ ...fields, ...this.at(editionId), position: held.length + 1 })
      .returning({ id: merchandiseItems.id })
    if (axes.length === 0) await this.addBareVariant(editionId, row!.id)
    else await this.addAxes(editionId, row!.id, axes)
    return this.get(editionId, row!.id)
  }

  /** An item hidden again keeps the moment it was first hidden at. */
  async update(
    editionId: string,
    id: string,
    changes: Omit<UpdateMerchandiseItem, 'axes' | 'pictureIds'>,
  ) {
    const { position, hidden, ...fields } = changes
    const tx = this.context.tx()
    if (Object.keys(fields).length > 0 || hidden !== undefined) {
      await tx
        .update(merchandiseItems)
        .set({
          ...fields,
          ...(hidden !== undefined && { hiddenAt: hiddenAt(merchandiseItems.hiddenAt, hidden) }),
        })
        .where(this.inEdition(editionId, id))
    }
    if (position !== undefined) {
      const order = await orderOf(tx, merchandiseItems, editionId)
      await arrange(tx, merchandiseItems, editionId, moved(order, id, position))
    }
  }

  /** The size charts of the values, as the files a change that removes the values lets go of. */
  private async chartsOf(valueIds: readonly string[]): Promise<string[]> {
    if (valueIds.length === 0) return []
    const charts = await this.context
      .tx()
      .select({ fileId: merchandiseSizeCharts.fileId })
      .from(merchandiseSizeCharts)
      .where(inArray(merchandiseSizeCharts.optionValueId, [...valueIds]))
    return charts.map((chart) => chart.fileId)
  }

  /**
   * Makes the axes of the item those of the list. An axis and a value that name their identifier
   * are renamed and moved; those without one are added; those left out go, a value with the
   * variants that held it. Once an axis is added or taken away no variant fits the axes any more:
   * every variant goes, and an item left without axes gets its one variant. Answers the size
   * charts of the values that went.
   */
  async setAxes(item: MerchandiseItem, axes: Axes): Promise<string[]> {
    const tx = this.context.tx()
    const { editionId, id } = item
    const stored = new Map(item.axes.map((axis) => [axis.id, axis]))
    for (const axis of axes) {
      const own = axis.id === undefined ? undefined : stored.get(axis.id)
      // An axis of another item and a value of another axis are unknown here, as a row outside
      // the parent its path names is.
      if (axis.id !== undefined && !own) throw notFound('option axis')
      const ownValues = new Set(own?.values.map((value) => value.id))
      if (axis.values.some((value) => value.id !== undefined && !ownValues.has(value.id))) {
        throw notFound('option value')
      }
    }
    const keptAxes = new Set(axes.flatMap((axis) => axis.id ?? []))
    const keptValues = new Set(
      axes.flatMap((axis) => axis.values.flatMap((value) => value.id ?? [])),
    )
    const goneAxes = item.axes.filter((axis) => !keptAxes.has(axis.id))
    const goneValues = item.axes
      .flatMap((axis) => axis.values)
      .filter((value) => !keptValues.has(value.id))
      .map((value) => value.id)
    const reshaped = goneAxes.length > 0 || axes.some((axis) => axis.id === undefined)
    const released = await this.chartsOf(goneValues)

    const ofItem = eq(merchandiseVariants.merchandiseItemId, id)
    if (reshaped) {
      await tx.delete(merchandiseVariants).where(ofItem)
    } else if (goneValues.length > 0) {
      const holding = tx
        .select({ id: merchandiseVariantValues.variantId })
        .from(merchandiseVariantValues)
        .where(inArray(merchandiseVariantValues.optionValueId, goneValues))
      await tx
        .delete(merchandiseVariants)
        .where(and(ofItem, inArray(merchandiseVariants.id, holding)))
    }
    if (goneAxes.length > 0) {
      await tx.delete(merchandiseOptionAxes).where(
        and(
          eq(merchandiseOptionAxes.merchandiseItemId, id),
          inArray(
            merchandiseOptionAxes.id,
            goneAxes.map((axis) => axis.id),
          ),
        ),
      )
    }
    if (goneValues.length > 0) {
      await tx
        .delete(merchandiseOptionValues)
        .where(
          and(
            eq(merchandiseOptionValues.merchandiseItemId, id),
            inArray(merchandiseOptionValues.id, goneValues),
          ),
        )
    }
    const of = { ...this.at(editionId), merchandiseItemId: id }
    for (const [index, axis] of axes.entries()) {
      if (axis.id === undefined) {
        await this.addAxes(editionId, id, [axis], index + 1)
        continue
      }
      await tx
        .update(merchandiseOptionAxes)
        .set({ name: axis.name, position: index + 1 })
        .where(this.ofItem(merchandiseOptionAxes, item, axis.id))
      for (const [place, value] of axis.values.entries()) {
        if (value.id === undefined) {
          await tx
            .insert(merchandiseOptionValues)
            .values({ ...of, axisId: axis.id, label: value.label, position: place + 1 })
        } else {
          await tx
            .update(merchandiseOptionValues)
            .set({ label: value.label, position: place + 1 })
            .where(this.ofItem(merchandiseOptionValues, item, value.id))
        }
      }
    }
    if (reshaped && axes.length === 0) await this.addBareVariant(editionId, id)
    return released
  }

  /** Puts the pictures of the item in the order of the list, which names each of them once. */
  async orderPictures(item: MerchandiseItem, pictureIds: readonly string[]) {
    const own = new Set(item.pictures.map((picture) => picture.id))
    const named = new Set(pictureIds)
    if (pictureIds.some((id) => !own.has(id))) throw notFound('picture')
    if (named.size !== pictureIds.length || named.size !== own.size) {
      throw invalidField('pictureIds', 'Every picture of the item, once each')
    }
    const tx = this.context.tx()
    for (const [index, pictureId] of pictureIds.entries()) {
      await tx
        .update(merchandiseItemPictures)
        .set({ position: index + 1 })
        .where(this.ofItem(merchandiseItemPictures, item, pictureId))
    }
  }

  /**
   * Deletes the item with everything of its own, the rest close ranks, and answers the files its
   * pictures and its size charts pointed at.
   */
  async remove(item: MerchandiseItem): Promise<ReleasedFiles> {
    const tx = this.context.tx()
    const released = {
      pictures: item.pictures.map((picture) => picture.fileId),
      sizeCharts: item.axes.flatMap((axis) =>
        axis.values.flatMap((value) => value.sizeChart?.fileId ?? []),
      ),
    }
    await tx.delete(merchandiseItems).where(this.inEdition(item.editionId, item.id))
    await arrange(
      tx,
      merchandiseItems,
      item.editionId,
      await orderOf(tx, merchandiseItems, item.editionId),
    )
    return released
  }

  /**
   * Makes the variants of the item those of the list. One the item has keeps its row and its
   * stock, a new one is out of stock, one left out goes.
   */
  async putVariants(item: MerchandiseItem, { variants }: PutVariants) {
    if (item.axes.length === 0) {
      throw invalidField('variants', 'An item without axes has its one variant')
    }
    if (variants.length > MAX_ITEM_VARIANTS) throw limitReached(MAX_ITEM_VARIANTS)
    const axisOf = new Map(
      item.axes.flatMap((axis) => axis.values.map((value) => [value.id, axis.id])),
    )
    const wanted = new Map<string, (typeof variants)[number]>()
    for (const variant of variants) {
      const axes = new Set(variant.valueIds.map((valueId) => axisOf.get(valueId)))
      if (axes.has(undefined)) throw notFound('option value')
      if (axes.size !== item.axes.length || variant.valueIds.length !== item.axes.length) {
        throw invalidField('variants', 'A variant has one value of each axis of its item')
      }
      const key = variantKey(variant.valueIds)
      if (wanted.has(key)) throw invalidField('variants', 'A variant is named once')
      wanted.set(key, variant)
    }

    const tx = this.context.tx()
    const stored = new Map(item.variants.map((variant) => [variantKey(variant.valueIds), variant]))
    const gone = [...stored].filter(([key]) => !wanted.has(key)).map(([, variant]) => variant.id)
    if (gone.length > 0) {
      await tx
        .delete(merchandiseVariants)
        .where(
          and(
            eq(merchandiseVariants.merchandiseItemId, item.id),
            inArray(merchandiseVariants.id, gone),
          ),
        )
    }
    const of = { ...this.at(item.editionId), merchandiseItemId: item.id }
    for (const [key, variant] of wanted) {
      const own = stored.get(key)
      if (own) {
        if (variant.hidden !== undefined && variant.hidden !== own.hidden) {
          await tx
            .update(merchandiseVariants)
            .set({ hiddenAt: hiddenAt(merchandiseVariants.hiddenAt, variant.hidden) })
            .where(this.ofItem(merchandiseVariants, item, own.id))
        }
        continue
      }
      const [made] = await tx
        .insert(merchandiseVariants)
        .values({ ...of, stock: 0, hiddenAt: variant.hidden ? new Date() : null })
        .returning({ id: merchandiseVariants.id })
      await tx.insert(merchandiseVariantValues).values(
        variant.valueIds.map((valueId) => ({
          ...of,
          variantId: made!.id,
          axisId: axisOf.get(valueId)!,
          optionValueId: valueId,
        })),
      )
    }
  }

  /** Sets the stock of a variant of the item, null while it is unlimited. */
  async putStock(item: MerchandiseItem, variantId: string, stock: number | null) {
    await this.context
      .tx()
      .update(merchandiseVariants)
      .set({ stock })
      .where(this.ofItem(merchandiseVariants, item, variantId))
  }

  /** Refuses a picture more than an item holds, before its file is kept. */
  roomForPicture(item: MerchandiseItem) {
    if (item.pictures.length >= MAX_ITEM_PICTURES) throw limitReached(MAX_ITEM_PICTURES)
  }

  /** A file just kept as the last picture of the item. */
  async addPicture(item: MerchandiseItem, fileId: string) {
    await this.context
      .tx()
      .insert(merchandiseItemPictures)
      .values({
        ...this.at(item.editionId),
        merchandiseItemId: item.id,
        fileId,
        position: item.pictures.length + 1,
      })
  }

  /** Removes a picture of the item, the rest close ranks; answers its file, or none. */
  async removePicture(item: MerchandiseItem, pictureId: string): Promise<string | undefined> {
    const picture = item.pictures.find((shot) => shot.id === pictureId)
    if (!picture) return undefined
    const tx = this.context.tx()
    await tx
      .delete(merchandiseItemPictures)
      .where(this.ofItem(merchandiseItemPictures, item, picture.id))
    for (const [index, left] of item.pictures.filter((shot) => shot.id !== picture.id).entries()) {
      await tx
        .update(merchandiseItemPictures)
        .set({ position: index + 1 })
        .where(this.ofItem(merchandiseItemPictures, item, left.id))
    }
    return picture.fileId
  }

  /**
   * Takes away the size chart of a value of the item; answers its file, or none. A value that is
   * not the item's has no chart here, whatever chart it has elsewhere.
   */
  async clearSizeChart(item: MerchandiseItem, valueId: string): Promise<string | undefined> {
    if (!item.axes.some((axis) => axis.values.some((value) => value.id === valueId))) {
      return undefined
    }
    const [gone] = await this.context
      .tx()
      .delete(merchandiseSizeCharts)
      .where(
        and(
          eq(merchandiseSizeCharts.editionId, item.editionId),
          eq(merchandiseSizeCharts.optionValueId, valueId),
        ),
      )
      .returning({ fileId: merchandiseSizeCharts.fileId })
    return gone?.fileId
  }

  /** A file just kept as the size chart of a value that has none. */
  async setSizeChart(editionId: string, valueId: string, fileId: string) {
    await this.context
      .tx()
      .insert(merchandiseSizeCharts)
      .values({ ...this.at(editionId), optionValueId: valueId, fileId })
  }

  /**
   * A file of the edition's merchandise: a picture or a size chart of one of its items, hidden
   * ones too, with its kind. Anything else is no file of this route. The identifier is the one
   * the row holds: a uuid reads the same in either case, and the bucket's keys do not.
   */
  async file(
    editionId: string,
    fileId: string,
  ): Promise<{ kind: string; fileId: string } | undefined> {
    const tx = this.context.tx()
    const [picture] = await tx
      .select({ fileId: merchandiseItemPictures.fileId })
      .from(merchandiseItemPictures)
      .where(
        and(
          eq(merchandiseItemPictures.editionId, editionId),
          eq(merchandiseItemPictures.fileId, fileId),
        ),
      )
    if (picture) return { kind: PICTURE_KIND, fileId: picture.fileId }
    const [chart] = await tx
      .select({ fileId: merchandiseSizeCharts.fileId })
      .from(merchandiseSizeCharts)
      .where(
        and(
          eq(merchandiseSizeCharts.editionId, editionId),
          eq(merchandiseSizeCharts.fileId, fileId),
        ),
      )
    return chart ? { kind: SIZE_CHART_KIND, fileId: chart.fileId } : undefined
  }

  /**
   * A file of the tenant's merchandise that is for everyone: a picture or a size chart of an item
   * that is not hidden, of a published edition. The query names the tenant itself besides RLS,
   * since what it answers decides which file anyone may read. The identifier is the one the row
   * holds, as in `file`.
   */
  async shownFile(
    tenantId: string,
    fileId: string,
  ): Promise<{ kind: string; fileId: string; editionId: string } | undefined> {
    const tx = this.context.tx()
    const shown = and(
      eq(merchandiseItems.tenantId, tenantId),
      isNull(merchandiseItems.hiddenAt),
      eq(editions.isPublished, true),
    )
    const [picture] = await tx
      .select({
        fileId: merchandiseItemPictures.fileId,
        editionId: merchandiseItemPictures.editionId,
      })
      .from(merchandiseItemPictures)
      .innerJoin(
        merchandiseItems,
        eq(merchandiseItems.id, merchandiseItemPictures.merchandiseItemId),
      )
      .innerJoin(editions, eq(editions.id, merchandiseItems.editionId))
      .where(and(eq(merchandiseItemPictures.fileId, fileId), shown))
    if (picture) return { kind: PICTURE_KIND, ...picture }
    const [chart] = await tx
      .select({ fileId: merchandiseSizeCharts.fileId, editionId: merchandiseSizeCharts.editionId })
      .from(merchandiseSizeCharts)
      .innerJoin(
        merchandiseOptionValues,
        eq(merchandiseOptionValues.id, merchandiseSizeCharts.optionValueId),
      )
      .innerJoin(
        merchandiseItems,
        eq(merchandiseItems.id, merchandiseOptionValues.merchandiseItemId),
      )
      .innerJoin(editions, eq(editions.id, merchandiseItems.editionId))
      .where(and(eq(merchandiseSizeCharts.fileId, fileId), shown))
    return chart ? { kind: SIZE_CHART_KIND, ...chart } : undefined
  }
}
