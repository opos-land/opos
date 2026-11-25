import { MAX_ITEM_VARIANTS, MAX_MERCHANDISE_IMAGE_SIZE, type MerchandiseItem } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { parseMoney } from '@opos/i18n'
import {
  axesBody,
  axesFields,
  EMPTY_ITEM,
  imageProblem,
  itemBody,
  itemFields,
  reshapes,
  stockWrites,
  variantRows,
  variantsPlan,
} from './merchandise'

const value = (id: string, label: string) => ({ id, label, sizeChart: null })
const shirt = (variants: MerchandiseItem['variants'] = []): MerchandiseItem => ({
  id: 'shirt',
  editionId: 'edition',
  name: 'T-shirt',
  description: '',
  amountMinor: 8000,
  perOrderLimit: 5,
  picturesIllustrative: false,
  position: 1,
  hidden: false,
  axes: [
    { id: 'cut', name: 'Cut', values: [value('w', "Women's"), value('m', "Men's")] },
    { id: 'size', name: 'Size', values: [value('s', 'S'), value('l', 'L')] },
  ],
  variants,
  pictures: [],
})
const variant = (id: string, valueIds: string[], stock: number | null = 0, hidden = false) => ({
  id,
  valueIds,
  stock,
  hidden,
})

describe('the variants of an item, as their editor lists them', () => {
  it('are every combination of one value of each axis, in the order of the axes', () => {
    const rows = variantRows(shirt())

    expect(rows.map((row) => row.labels)).toEqual([
      ["Women's", 'S'],
      ["Women's", 'L'],
      ["Men's", 'S'],
      ["Men's", 'L'],
    ])
    expect(rows.every((row) => !row.exists && row.stock === '0' && !row.unlimited)).toBe(true)
  })

  it('show which exist, with the stock each holds', () => {
    const rows = variantRows(
      shirt([variant('v1', ['s', 'w'], 12), variant('v2', ['m', 'l'], null, true)]),
    )

    expect(rows.map((row) => [row.labels.join(' '), row.exists, row.stock, row.unlimited])).toEqual(
      [
        ["Women's S", true, '12', false],
        ["Women's L", false, '0', false],
        ["Men's S", false, '0', false],
        // An unlimited variant holds no number; its field stays empty.
        ["Men's L", true, '', true],
      ],
    )
    expect(rows[3]!.hidden).toBe(true)
  })

  it('are the one variant of an item without axes', () => {
    const mug = { ...shirt([variant('only', [], 40)]), axes: [] }

    expect(variantRows(mug)).toMatchObject([{ labels: [], exists: true, stock: '40' }])
  })
})

describe('what saving the variants asks for', () => {
  const rows = () => variantRows(shirt([variant('v1', ['w', 's'], 12)]))

  it('names the variants that exist, and the stock of each that changed', () => {
    const edited = rows().map((row) =>
      row.labels.join(' ') === "Women's S"
        ? { ...row, stock: '20' }
        : row.labels.join(' ') === "Men's L"
          ? { ...row, exists: true, stock: '', unlimited: true }
          : row,
    )

    expect(variantsPlan(edited)).toEqual({
      variants: [
        { valueIds: ['w', 's'], hidden: false },
        { valueIds: ['m', 'l'], hidden: false },
      ],
      stocks: [
        { valueIds: ['w', 's'], stock: 20 },
        { valueIds: ['m', 'l'], stock: null },
      ],
    })
  })

  it('leaves out a variant that no longer exists', () => {
    const edited = rows().map((row) => ({ ...row, exists: false }))

    expect(variantsPlan(edited)).toEqual({ variants: [], stocks: [] })
  })

  it.each([
    ['a stock that is no whole number', '2.5'],
    ['a stock below zero', '-1'],
    ['an empty stock of a variant that is not unlimited', ''],
  ])('refuses %s', (_, stock) => {
    const edited = rows().map((row) => (row.exists ? { ...row, stock } : row))

    expect(variantsPlan(edited)).toEqual({ problem: 'stock' })
  })

  it('refuses more variants than an item holds', () => {
    const many = Array.from({ length: MAX_ITEM_VARIANTS + 1 }, (_, n) => ({
      ...rows()[0]!,
      exists: true,
      valueIds: [`v${n}`],
    }))

    expect(variantsPlan(many)).toEqual({ problem: 'limit' })
  })
})

describe('the stock saving the variants writes', () => {
  const loaded = shirt([variant('v1', ['w', 's'], 12), variant('v2', ['w', 'l'], 50)])
  const stocks = (first: number | null, second: number | null) => [
    { valueIds: ['w', 's'], stock: first },
    { valueIds: ['w', 'l'], stock: second },
  ]

  it('is that of a variant whose number the form changed', () => {
    expect(stockWrites(loaded, loaded, stocks(20, 50))).toEqual([{ variantId: 'v1', stock: 20 }])
    expect(stockWrites(loaded, loaded, stocks(12, null))).toEqual([
      { variantId: 'v2', stock: null },
    ])
    expect(stockWrites(loaded, loaded, stocks(12, 50))).toEqual([])
  })

  it('leaves a number the form did not change as the API holds it by now', () => {
    // Someone else lowered the stock of the second variant since the form was filled.
    const saved = shirt([variant('v1', ['w', 's'], 12), variant('v2', ['w', 'l'], 20)])

    expect(stockWrites(loaded, saved, stocks(12, 50))).toEqual([])
    expect(stockWrites(loaded, saved, stocks(30, 50))).toEqual([{ variantId: 'v1', stock: 30 }])
  })

  it('sets the number of a variant the save made, and none that the API holds already', () => {
    const saved = shirt([
      variant('v1', ['w', 's'], 12),
      // Made anew: the one the form was filled from is gone.
      variant('v9', ['w', 'l'], 0),
      variant('v3', ['m', 'l'], 0),
    ])

    expect(
      stockWrites(loaded, saved, [...stocks(12, 50), { valueIds: ['m', 'l'], stock: 0 }]),
    ).toEqual([{ variantId: 'v9', stock: 50 }])
    expect(
      stockWrites(loaded, saved, [...stocks(12, 50), { valueIds: ['m', 'l'], stock: 7 }]),
    ).toEqual([
      { variantId: 'v9', stock: 50 },
      { variantId: 'v3', stock: 7 },
    ])
  })

  it('writes nothing for a variant the API did not answer', () => {
    expect(stockWrites(loaded, shirt(), stocks(20, 50))).toEqual([])
  })
})

describe('the axes of an item, as their editor holds them', () => {
  it('are read from the item and written back with the identifiers they had', () => {
    const fields = axesFields(shirt())

    expect(axesBody(fields)).toEqual({
      axes: [
        {
          id: 'cut',
          name: 'Cut',
          values: [
            { id: 'w', label: "Women's" },
            { id: 'm', label: "Men's" },
          ],
        },
        {
          id: 'size',
          name: 'Size',
          values: [
            { id: 's', label: 'S' },
            { id: 'l', label: 'L' },
          ],
        },
      ],
    })
  })

  it('give a new axis and a new value no identifier, and drop a value left empty', () => {
    const fields = [
      ...axesFields(shirt()),
      { name: ' Colour ', values: [{ label: 'Black' }, { label: ' ' }] },
    ]

    expect(axesBody(fields)).toMatchObject({
      axes: [{ id: 'cut' }, { id: 'size' }, { name: 'Colour', values: [{ label: 'Black' }] }],
    })
  })

  it.each([
    ['an axis without a name', [{ name: ' ', values: [{ label: 'M' }] }]],
    ['an axis without a value', [{ name: 'Size', values: [{ label: ' ' }] }]],
    [
      'two axes of one name',
      [
        { name: 'Size', values: [{ label: 'M' }] },
        { name: 'size', values: [{ label: 'L' }] },
      ],
    ],
    ['a value twice in an axis', [{ name: 'Size', values: [{ label: 'M' }, { label: 'm ' }] }]],
  ])('refuse %s', (_, fields) => {
    expect(axesBody(fields)).toBeNull()
  })

  it('take every variant away once an axis is added or removed, and some once a value is', () => {
    const item = shirt([variant('v1', ['w', 's'])])
    const fields = axesFields(item)

    expect(reshapes(item, fields)).toBe(false)
    expect(reshapes(item, [{ ...fields[0]!, name: 'Fit' }, fields[1]!])).toBe(false)
    expect(reshapes(item, [...fields, { name: 'Colour', values: [{ label: 'Black' }] }])).toBe(true)
    expect(reshapes(item, [fields[0]!])).toBe(true)
    expect(reshapes(item, [fields[0]!, { ...fields[1]!, values: [fields[1]!.values[1]!] }])).toBe(
      true,
    )
    // A value added touches no variant.
    expect(
      reshapes(item, [
        fields[0]!,
        { ...fields[1]!, values: [...fields[1]!.values, { label: 'XL' }] },
      ]),
    ).toBe(false)
    // An item with no variant has none to lose.
    expect(reshapes(shirt(), [fields[0]!])).toBe(false)
  })

  it('take the variants of a value whose label is cleared, as the request leaves it out', () => {
    const item = shirt([variant('v1', ['w', 's'])])
    const [cut, size] = axesFields(item)
    const cleared = [cut!, { ...size!, values: [{ id: 's', label: ' ' }, size!.values[1]!] }]

    expect(axesBody(cleared)).toMatchObject({ axes: [{}, { values: [{ id: 'l', label: 'L' }] }] })
    expect(reshapes(item, cleared)).toBe(true)
    // A new row left empty is no value yet: nothing goes with it.
    expect(reshapes(item, [cut!, { ...size!, values: [...size!.values, { label: '' }] }])).toBe(
      false,
    )
  })

  it('take the size chart of a value that goes, of an item with no variant too', () => {
    const chart = { fileId: 'chart-w', width: 400, height: 300 }
    const item: MerchandiseItem = {
      ...shirt(),
      axes: [
        {
          id: 'cut',
          name: 'Cut',
          values: [{ ...value('w', "Women's"), sizeChart: chart }, value('m', "Men's")],
        },
        shirt().axes[1]!,
      ],
    }
    const [cut, size] = axesFields(item)

    expect(reshapes(item, [cut!, size!])).toBe(false)
    // The value without a chart goes with nothing.
    expect(reshapes(item, [{ ...cut!, values: [cut!.values[0]!] }, size!])).toBe(false)
    expect(reshapes(item, [{ ...cut!, values: [cut!.values[1]!] }, size!])).toBe(true)
    expect(
      reshapes(item, [{ ...cut!, values: [{ id: 'w', label: '' }, cut!.values[1]!] }, size!]),
    ).toBe(true)
    // An axis that goes takes its values, and their size charts.
    expect(reshapes(item, [size!])).toBe(true)
  })
})

describe('an image chosen for an item', () => {
  const file = (type: string, size = 1000) => ({ type, size }) as File

  it('is a JPEG, a PNG or a WebP within the limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(imageProblem(file(type))).toBeNull()
    }
    expect(imageProblem(file('image/png', MAX_MERCHANDISE_IMAGE_SIZE))).toBeNull()
  })

  it('is refused as another type, an SVG among them, or over the limit', () => {
    expect(imageProblem(file('image/svg+xml'))).toBe('type')
    expect(imageProblem(file('application/pdf'))).toBe('type')
    expect(imageProblem(file('image/png', MAX_MERCHANDISE_IMAGE_SIZE + 1))).toBe('size')
  })
})

describe('the form of a merchandise item', () => {
  const fields = (values: Partial<typeof EMPTY_ITEM> = {}) => ({
    ...EMPTY_ITEM,
    name: 'Mug',
    price: '35',
    perOrderLimit: '4',
    ...values,
  })

  it('reads the name, the price and the most a single order may take', () => {
    expect(
      itemBody(
        fields({ name: ' Mug ', description: ' Ceramic. ', picturesIllustrative: true }),
        parseMoney,
      ),
    ).toEqual({
      body: {
        name: 'Mug',
        description: 'Ceramic.',
        amountMinor: 3500,
        perOrderLimit: 4,
        picturesIllustrative: true,
      },
    })
  })

  it.each([
    ['no name', { name: '' }, ['name']],
    ['a price that is no amount', { price: 'cheap' }, ['price']],
    ['a limit an order below one', { perOrderLimit: '0' }, ['perOrderLimit']],
    ['a limit an order over 100', { perOrderLimit: '101' }, ['perOrderLimit']],
    ['a limit an order left empty', { perOrderLimit: ' ' }, ['perOrderLimit']],
  ])('names what is wrong with %s', (_, values, problems) => {
    expect(itemBody(fields(values), parseMoney)).toEqual({ problems })
  })

  it('fills the form from an item', () => {
    expect(itemFields(shirt(), (amount) => (amount / 100).toFixed(2))).toEqual({
      name: 'T-shirt',
      description: '',
      price: '80.00',
      perOrderLimit: '5',
      picturesIllustrative: false,
    })
  })
})
