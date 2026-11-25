import {
  type CreateMerchandiseItem,
  MAX_ITEM_VARIANTS,
  MAX_MERCHANDISE_IMAGE_SIZE,
  MERCHANDISE_IMAGE_TYPES,
  type MerchandiseItem,
  type PutVariants,
  type UpdateMerchandiseItem,
} from '@opos/contract'
import { wholeNumber } from './add-on-form'

/** What names a variant among those of its item: its values, whatever order they came in. */
const keyOf = (valueIds: readonly string[]) => [...valueIds].sort().join(' ')

/** A combination of one value of each axis, as a row of the variants editor. */
export interface VariantRow {
  /** In the order of the item's axes. */
  valueIds: string[]
  labels: string[]
  /** Whether a buyer can take this combination at all. */
  exists: boolean
  /** The stock as its field holds it; empty while the variant is unlimited. */
  stock: string
  unlimited: boolean
  hidden: boolean
}

/**
 * Every combination of one value of each axis of the item, in the order of the axes, with what
 * the item holds of it; an item without axes has its one variant.
 */
export function variantRows(item: MerchandiseItem): VariantRow[] {
  const stored = new Map(item.variants.map((variant) => [keyOf(variant.valueIds), variant]))
  const combinations = item.axes.reduce<{ valueIds: string[]; labels: string[] }[]>(
    (rows, axis) =>
      rows.flatMap((row) =>
        axis.values.map((value) => ({
          valueIds: [...row.valueIds, value.id],
          labels: [...row.labels, value.label],
        })),
      ),
    [{ valueIds: [], labels: [] }],
  )
  return combinations.map((combination) => {
    const own = stored.get(keyOf(combination.valueIds))
    return {
      ...combination,
      exists: own !== undefined,
      stock: own ? (own.stock === null ? '' : String(own.stock)) : '0',
      unlimited: own?.stock === null,
      hidden: own?.hidden ?? false,
    }
  })
}

/**
 * What saving the rows asks the API for: the variants that exist, and the stock of each, set once
 * the variants are there. Or what is wrong: a stock that is no whole number, or more variants
 * than an item holds.
 */
export function variantsPlan(
  rows: readonly VariantRow[],
):
  | { variants: PutVariants['variants']; stocks: { valueIds: string[]; stock: number | null }[] }
  | { problem: 'stock' | 'limit' } {
  const wanted = rows.filter((row) => row.exists)
  if (wanted.length > MAX_ITEM_VARIANTS) return { problem: 'limit' }
  const stocks = wanted.map((row) => ({
    valueIds: row.valueIds,
    stock: row.unlimited ? null : wholeNumber(row.stock),
    unlimited: row.unlimited,
  }))
  if (stocks.some((row) => !row.unlimited && row.stock === null)) return { problem: 'stock' }
  return {
    variants: wanted.map((row) => ({ valueIds: row.valueIds, hidden: row.hidden })),
    stocks: stocks.map(({ valueIds, stock }) => ({ valueIds, stock })),
  }
}

/**
 * The variants the form was filled with, each hidden or shown, as saving them tells the API: it
 * refuses the list once the item has other variants by then, which someone else added, deleted,
 * hid or showed since. The stock is no part of it: `stockWrites` leaves another's number alone.
 */
export const knownVariants = (item: MerchandiseItem): NonNullable<PutVariants['known']> =>
  item.variants.map(({ id, hidden }) => ({ id, hidden }))

/** The variant of the item that holds exactly these values, once the API answered the item. */
export const variantOf = (item: MerchandiseItem, valueIds: readonly string[]) =>
  item.variants.find((variant) => keyOf(variant.valueIds) === keyOf(valueIds))

/**
 * The stock saving the rows sets, once the API answered the item with the variants that exist: of
 * a variant whose number the form changed from the one it was filled with, and of a variant the
 * save made. A number the form did not change stays as the API holds it by now, which someone else
 * may have set since the form was filled.
 */
export function stockWrites(
  loaded: MerchandiseItem,
  saved: MerchandiseItem,
  stocks: readonly { valueIds: string[]; stock: number | null }[],
): { variantId: string; stock: number | null }[] {
  return stocks.flatMap(({ valueIds, stock }) => {
    const variant = variantOf(saved, valueIds)
    if (!variant || variant.stock === stock) return []
    const before = variantOf(loaded, valueIds)
    const untouched = before?.id === variant.id && before.stock === stock
    return untouched ? [] : [{ variantId: variant.id, stock }]
  })
}

/** An axis as its editor holds it: one that exists names its identifier, and so do its values. */
export interface AxisFields {
  id?: string
  name: string
  values: { id?: string; label: string }[]
}

export const axesFields = (item: MerchandiseItem): AxisFields[] =>
  item.axes.map((axis) => ({
    id: axis.id,
    name: axis.name,
    values: axis.values.map(({ id, label }) => ({ id, label })),
  }))

/**
 * What fills the editor of the axes anew once it changes: the item and the axes as the editor
 * holds them. A size chart or a variant, which another editor saves, is no part of it, so saving
 * there leaves what is typed here and not saved yet.
 */
export const axesKey = (item: MerchandiseItem) => JSON.stringify([item.id, axesFields(item)])

/**
 * What fills the editor of the variants anew once it changes: the item and its rows, which hold
 * the values of the axes, the variants that exist, their stock and whether each is hidden. A size
 * chart is no part of it.
 */
export const variantsKey = (item: MerchandiseItem) => JSON.stringify([item.id, variantRows(item)])

const distinct = (texts: readonly string[]) =>
  new Set(texts.map((text) => text.toLowerCase())).size === texts.length

/**
 * The axes as a request carries them, a value left empty dropped; null when an axis has no name
 * or no value, or a name or a label is used twice.
 */
export function axesBody(
  fields: readonly AxisFields[],
): Pick<UpdateMerchandiseItem, 'axes'> | null {
  const axes = fields.map((axis) => ({
    ...(axis.id !== undefined && { id: axis.id }),
    name: axis.name.trim(),
    values: axis.values
      .map((value) => ({
        ...(value.id !== undefined && { id: value.id }),
        label: value.label.trim(),
      }))
      .filter((value) => value.label),
  }))
  const whole = axes.every(
    (axis) =>
      axis.name && axis.values.length > 0 && distinct(axis.values.map((value) => value.label)),
  )
  return whole && distinct(axes.map((axis) => axis.name)) ? { axes } : null
}

/**
 * What saving these axes takes away that the screen cannot bring back, null when nothing: every
 * variant once an axis is added or removed, those that held a value once the value is removed, and
 * the size chart of a value that goes. A value goes as the request drops it: left out, or its
 * label left empty. An item with no variant loses none, and a value without a size chart goes with
 * nothing else.
 */
export function takenByAxes(
  item: MerchandiseItem,
  fields: readonly AxisFields[],
): 'variants' | 'size-charts' | 'both' | null {
  const keptAxes = new Set(fields.flatMap((axis) => axis.id ?? []))
  const keptValues = new Set(
    fields.flatMap((axis) =>
      axis.values.flatMap((entry) => (entry.label.trim() ? (entry.id ?? []) : [])),
    ),
  )
  const charted = item.axes.flatMap((axis) => axis.values.filter((value) => value.sizeChart))
  const sizeCharts = charted.some((value) => !keptValues.has(value.id))
  const variants =
    item.variants.length > 0 &&
    (fields.some((axis) => axis.id === undefined) ||
      item.axes.some((axis) => !keptAxes.has(axis.id)) ||
      item.variants.some((variant) => variant.valueIds.some((id) => !keptValues.has(id))))
  if (variants) return sizeCharts ? 'both' : 'variants'
  return sizeCharts ? 'size-charts' : null
}

/** Why a chosen file cannot be a picture or a size chart, before it is sent; null when it can. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): 'type' | 'size' | null {
  if (!(MERCHANDISE_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type'
  return file.size > MAX_MERCHANDISE_IMAGE_SIZE ? 'size' : null
}

/** The fields of an item as a form holds them: text, as a person types it. */
export interface ItemFields {
  name: string
  description: string
  price: string
  perOrderLimit: string
  picturesIllustrative: boolean
}

export const EMPTY_ITEM: ItemFields = {
  name: '',
  description: '',
  price: '',
  perOrderLimit: '1',
  picturesIllustrative: false,
}

export type ItemProblem = 'name' | 'price' | 'perOrderLimit'

/** The body of the request the fields make, or what is wrong with them. */
export function itemBody(
  fields: ItemFields,
  parse: (text: string) => number | null,
): { body: Required<Omit<CreateMerchandiseItem, 'axes'>> } | { problems: ItemProblem[] } {
  const problems: ItemProblem[] = []
  const name = fields.name.trim()
  const amountMinor = parse(fields.price)
  const perOrderLimit = wholeNumber(fields.perOrderLimit)
  if (!name) problems.push('name')
  if (amountMinor === null) problems.push('price')
  if (perOrderLimit === null || perOrderLimit < 1 || perOrderLimit > 100) {
    problems.push('perOrderLimit')
  }
  if (problems.length > 0 || amountMinor === null || perOrderLimit === null) return { problems }
  return {
    body: {
      name,
      description: fields.description.trim(),
      amountMinor,
      perOrderLimit,
      picturesIllustrative: fields.picturesIllustrative,
    },
  }
}

/** The form of an item that exists, its price written as a field holds one. */
export const itemFields = (
  item: MerchandiseItem,
  toInput: (amountMinor: number) => string,
): ItemFields => ({
  name: item.name,
  description: item.description,
  price: toInput(item.amountMinor),
  perOrderLimit: String(item.perOrderLimit),
  picturesIllustrative: item.picturesIllustrative,
})
