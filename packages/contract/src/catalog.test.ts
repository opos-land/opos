import { describe, expect, it } from 'vitest'
import {
  addOnSchema,
  ADD_ON_KINDS,
  AGE_BANDS,
  createAddOnSchema,
  createCustomFieldSchema,
  createMerchandiseItemSchema,
  createTicketTypeSchema,
  customFieldSchema,
  MAX_ADD_ONS,
  MAX_AMOUNT_MINOR,
  MAX_CUSTOM_FIELDS,
  MAX_ITEM_PICTURES,
  MAX_ITEM_VARIANTS,
  MAX_MERCHANDISE_IMAGE_SIZE,
  MAX_MERCHANDISE_ITEMS,
  MAX_TICKET_TYPES,
  MERCHANDISE_IMAGE_TYPES,
  MERCHANDISE_IMAGE_VARIANTS,
  merchandiseItemSchema,
  offeredSupporterPrices,
  priceAt,
  putStockSchema,
  putVariantsSchema,
  updateAddOnSchema,
  updateCustomFieldSchema,
  updateMerchandiseItemSchema,
  updateTicketTypeSchema,
} from './catalog'
import { MAX_FILE_SIZE } from './files'
import { errorCodes } from './errors'
import { contract } from './index'

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe('a ticket type', () => {
  const standard = {
    name: 'Standard',
    saleStartsAt: '2027-01-01T00:00:00.000Z',
    saleEndsAt: '2027-06-01T00:00:00.000Z',
    ageBands: ['adult'],
  }
  const tier = (amountMinor: number, startsAt: string, endsAt: string) => ({
    amountMinor,
    startsAt,
    endsAt,
  })
  const tiers = [
    tier(12000, '2027-01-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z'),
    tier(15000, '2027-03-01T00:00:00.000Z', '2027-05-01T00:00:00.000Z'),
  ]

  it('allows some of the three age bands', () => {
    expect([...AGE_BANDS]).toEqual(['child', 'teen', 'adult'])
    refused(createTicketTypeSchema.safeParse({ ...standard, ageBands: [] }))
    refused(createTicketTypeSchema.safeParse({ ...standard, ageBands: ['adult', 'adult'] }))
    refused(createTicketTypeSchema.safeParse({ ...standard, ageBands: ['senior'] }))
  })

  it('is added with a name, a sale window that ends after it starts and its age bands', () => {
    expect(createTicketTypeSchema.parse({ ...standard, name: ' Standard ' })).toEqual(standard)
    refused(createTicketTypeSchema.safeParse({ ...standard, saleEndsAt: standard.saleStartsAt }))
    refused(createTicketTypeSchema.safeParse({ name: 'Standard', ageBands: ['adult'] }))
  })

  it('has a capacity that is a whole number, or none: without one it is not limited', () => {
    expect(createTicketTypeSchema.parse({ ...standard, capacity: null }).capacity).toBeNull()
    expect(createTicketTypeSchema.parse({ ...standard, capacity: 0 }).capacity).toBe(0)
    refused(createTicketTypeSchema.safeParse({ ...standard, capacity: -1 }))
    refused(createTicketTypeSchema.safeParse({ ...standard, capacity: 10.5 }))
  })

  // Whether two tiers overlap the API answers by a code of its own, so the schema does not judge
  // it: it judges each tier alone.
  it('takes tiers that each end after they start, at a price that may be zero', () => {
    expect(createTicketTypeSchema.safeParse({ ...standard, tiers }).success).toBe(true)
    expect(
      createTicketTypeSchema.safeParse({
        ...standard,
        tiers: [tier(0, standard.saleStartsAt, standard.saleEndsAt)],
      }).success,
    ).toBe(true)
    refused(
      createTicketTypeSchema.safeParse({
        ...standard,
        tiers: [tier(100, standard.saleEndsAt, standard.saleStartsAt)],
      }),
    )
  })

  it('takes supporter prices above zero, each once', () => {
    expect(
      createTicketTypeSchema.safeParse({ ...standard, supporterPrices: [20000, 30000] }).success,
    ).toBe(true)
    refused(createTicketTypeSchema.safeParse({ ...standard, supporterPrices: [0] }))
    refused(createTicketTypeSchema.safeParse({ ...standard, supporterPrices: [20000, 20000] }))
  })

  it('changes with its tiers, supporter prices, perks and offers as whole lists', () => {
    expect(Object.keys(updateTicketTypeSchema.shape).sort()).toEqual([
      'addOnIds',
      'ageBands',
      'capacity',
      'discountsExcluded',
      'hidden',
      'longDescription',
      'merchandiseItemIds',
      'name',
      'perks',
      'position',
      'saleEndsAt',
      'saleStartsAt',
      'shortDescription',
      'shownOutsideSaleWindow',
      'supporterPrices',
      'tiers',
    ])
    expect(updateTicketTypeSchema.parse({ tiers: [] })).toEqual({ tiers: [] })
  })

  describe('at a moment', () => {
    const at = (moment: string) => priceAt(tiers, new Date(moment))

    it('costs what the tier covering the moment says', () => {
      expect(at('2027-02-01T12:00:00.000Z')).toBe(12000)
      expect(at('2027-04-01T12:00:00.000Z')).toBe(15000)
    })

    it('belongs to a tier from its start, and no longer at its end', () => {
      expect(at('2027-01-01T00:00:00.000Z')).toBe(12000)
      expect(at('2027-02-28T23:59:59.999Z')).toBe(12000)
      expect(at('2027-03-01T00:00:00.000Z')).toBe(15000)
      expect(at('2027-04-30T23:59:59.999Z')).toBe(15000)
    })

    it('has no price where no tier covers the moment: it is not on sale', () => {
      expect(at('2026-12-31T23:59:59.999Z')).toBeNull()
      expect(at('2027-05-01T00:00:00.000Z')).toBeNull()
      expect(priceAt([], new Date('2027-02-01T12:00:00.000Z'))).toBeNull()
    })

    it('offers the supporter prices above the price in force, and no other', () => {
      expect(offeredSupporterPrices([10000, 12000, 20000, 30000], 12000)).toEqual([20000, 30000])
      expect(offeredSupporterPrices([10000, 12000], 12000)).toEqual([])
      expect(offeredSupporterPrices([100], 0)).toEqual([100])
    })
  })
})

describe('an add-on', () => {
  it('is without a limit, limited by a capacity, or a headcount that reserves nothing', () => {
    expect([...ADD_ON_KINDS]).toEqual(['unlimited', 'limited', 'headcount'])
  })

  it('is added with a trimmed name, a price that may be zero and its kind', () => {
    expect(createAddOnSchema.parse({ name: ' Room ', amountMinor: 0, kind: 'headcount' })).toEqual({
      name: 'Room',
      amountMinor: 0,
      kind: 'headcount',
    })
  })

  it.each([
    ['a limited one without a capacity', { kind: 'limited' }],
    ['a capacity on one that is not limited', { kind: 'unlimited', capacity: 5 }],
    ['a threshold on one that is not limited', { kind: 'headcount', placesLeftThreshold: 5 }],
    ['a threshold below one', { kind: 'limited', capacity: 5, placesLeftThreshold: 0 }],
    ['a price below zero', { amountMinor: -1 }],
    ['a price of a fraction of the minor unit', { amountMinor: 0.5 }],
    ['a price over the largest amount', { amountMinor: MAX_AMOUNT_MINOR + 1 }],
    ['a description over 1000 characters', { description: 'd'.repeat(1001) }],
    ['a place of its own choosing', { position: 2 }],
  ])('is not added with %s', (_, values) => {
    refused(
      createAddOnSchema.safeParse({ name: 'Room', amountMinor: 0, kind: 'unlimited', ...values }),
    )
  })

  // What a change leaves of the stored add-on decides whether it holds together, so the API
  // checks it against the row: the schema of a change names the fields alone.
  it('changes any of its fields, its place and whether the shop shows it', () => {
    expect(Object.keys(updateAddOnSchema.shape).sort()).toEqual([
      'amountMinor',
      'capacity',
      'description',
      'hidden',
      'kind',
      'name',
      'placesLeftThreshold',
      'position',
    ])
    expect(updateAddOnSchema.parse({})).toEqual({})
    refused(updateAddOnSchema.safeParse({ position: 0 }))
    refused(updateAddOnSchema.safeParse({ editionId: '0198c1a0-0000-7000-8000-000000000001' }))
  })

  it('answers what a screen shows of it', () => {
    expect(Object.keys(addOnSchema.shape).sort()).toEqual([
      'amountMinor',
      'capacity',
      'description',
      'editionId',
      'hidden',
      'id',
      'kind',
      'name',
      'placesLeftThreshold',
      'position',
    ])
  })
})

describe('a custom field', () => {
  // An answer is a short text and nothing else: the field has no type to choose.
  it('is a label and whether an answer is required, and nothing else', () => {
    expect(createCustomFieldSchema.parse({ label: ' Fandom ', isRequired: true })).toEqual({
      label: 'Fandom',
      isRequired: true,
    })
    refused(createCustomFieldSchema.safeParse({ label: 'Fandom' }))
    refused(createCustomFieldSchema.safeParse({ label: 'Age', isRequired: true, type: 'number' }))
    refused(createCustomFieldSchema.safeParse({ label: 'l'.repeat(101), isRequired: true }))
  })

  it('changes its label, whether it is required, its place and whether the shop asks it', () => {
    expect(Object.keys(updateCustomFieldSchema.shape).sort()).toEqual([
      'hidden',
      'isRequired',
      'label',
      'position',
    ])
  })

  it('answers what a screen shows of it', () => {
    expect(Object.keys(customFieldSchema.shape).sort()).toEqual([
      'editionId',
      'hidden',
      'id',
      'isRequired',
      'label',
      'position',
    ])
  })
})

describe('a merchandise item', () => {
  const mug = { name: 'Mug', amountMinor: 3500, perOrderLimit: 4 }
  const value = '0198c1a0-0000-7000-8000-000000000001'

  it('is added with a name, a price and the most a single order may take of it', () => {
    expect(createMerchandiseItemSchema.parse({ ...mug, name: ' Mug ' })).toEqual(mug)
    refused(createMerchandiseItemSchema.safeParse({ name: 'Mug', amountMinor: 3500 }))
    refused(createMerchandiseItemSchema.safeParse({ ...mug, perOrderLimit: 0 }))
    refused(createMerchandiseItemSchema.safeParse({ ...mug, perOrderLimit: 101 }))
  })

  // Merchandise is picked up at the edition: the catalog has no field for shipping.
  it('has no field for shipping', () => {
    expect(JSON.stringify(Object.keys(merchandiseItemSchema.shape))).not.toMatch(/ship|deliver/i)
    refused(createMerchandiseItemSchema.safeParse({ ...mug, shippingMinor: 1500 }))
  })

  it('may have up to three axes, each with a name and its values', () => {
    const axis = (name: string) => ({ name, values: [{ label: 'One' }] })

    expect(
      createMerchandiseItemSchema.safeParse({ ...mug, axes: ['Cut', 'Size', 'Colour'].map(axis) })
        .success,
    ).toBe(true)
    refused(createMerchandiseItemSchema.safeParse({ ...mug, axes: ['A', 'B', 'C', 'D'].map(axis) }))
    refused(createMerchandiseItemSchema.safeParse({ ...mug, axes: [{ name: 'Cut', values: [] }] }))
    refused(createMerchandiseItemSchema.safeParse({ ...mug, axes: [axis('Cut'), axis(' cut ')] }))
    refused(
      createMerchandiseItemSchema.safeParse({
        ...mug,
        axes: [{ name: 'Size', values: [{ label: 'M' }, { label: ' m' }] }],
      }),
    )
    // A new item has no axis of its own yet to name.
    refused(
      createMerchandiseItemSchema.safeParse({ ...mug, axes: [{ ...axis('Cut'), id: value }] }),
    )
  })

  it('changes with its axes and the order of its pictures as whole lists', () => {
    expect(Object.keys(updateMerchandiseItemSchema.shape).sort()).toEqual([
      'amountMinor',
      'axes',
      'description',
      'hidden',
      'name',
      'perOrderLimit',
      'pictureIds',
      'picturesIllustrative',
      'position',
    ])
    expect(
      updateMerchandiseItemSchema.safeParse({
        axes: [
          { id: value, name: 'Cut', values: [{ id: value, label: 'Fitted' }, { label: 'New' }] },
        ],
      }).success,
    ).toBe(true)
  })

  it('names the variants that exist by one value of each axis', () => {
    expect(putVariantsSchema.parse({ variants: [{ valueIds: [value] }] })).toEqual({
      variants: [{ valueIds: [value] }],
    })
    refused(putVariantsSchema.safeParse({ variants: [{ valueIds: ['M'] }] }))
    refused(putVariantsSchema.safeParse({ variants: [{ valueIds: [value], stock: 5 }] }))
    refused(putVariantsSchema.safeParse({}))
  })

  it('holds a stock that is a whole number from zero, or none while it is unlimited', () => {
    expect(putStockSchema.parse({ stock: 0 })).toEqual({ stock: 0 })
    expect(putStockSchema.parse({ stock: null })).toEqual({ stock: null })
    refused(putStockSchema.safeParse({ stock: -1 }))
    refused(putStockSchema.safeParse({ stock: 2.5 }))
    refused(putStockSchema.safeParse({}))
  })

  it('takes its pictures and size charts as images alone, in two sizes', () => {
    expect([...MERCHANDISE_IMAGE_TYPES]).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    expect([...MERCHANDISE_IMAGE_VARIANTS]).toEqual(['small', 'large'])
    expect(MAX_MERCHANDISE_IMAGE_SIZE).toBeLessThanOrEqual(MAX_FILE_SIZE)
    expect(MAX_ITEM_PICTURES).toBe(10)
  })

  it('answers its files by identifier and proportions, and no place in the bucket', () => {
    expect(Object.keys(merchandiseItemSchema.shape.pictures.element.shape).sort()).toEqual([
      'fileId',
      'height',
      'id',
      'width',
    ])
  })
})

describe('the catalog of an edition', () => {
  it('holds a number of rows of each kind that one answer can carry', () => {
    expect(MAX_ADD_ONS).toBe(50)
    expect(MAX_CUSTOM_FIELDS).toBe(20)
    expect(MAX_TICKET_TYPES).toBe(50)
    expect(MAX_MERCHANDISE_ITEMS).toBe(200)
    expect(MAX_ITEM_VARIANTS).toBe(100)
  })

  it('is reached under the edition of the path', () => {
    const routes = [
      ...Object.values(contract.catalog.addOns),
      ...Object.values(contract.catalog.customFields),
      ...Object.values(contract.catalog.merchandise),
      ...Object.values(contract.catalog.ticketTypes),
    ].map((procedure) => procedure['~orpc'].route.path)

    expect(routes.every((path) => path?.startsWith('/editions/{editionId}/'))).toBe(true)
  })

  it("serves a shown item's pictures to everyone, under the convention's address", () => {
    expect(contract.public.merchandiseFile['~orpc'].route.path).toBe(
      '/public/tenants/{slug}/merchandise-files/{fileId}/{variant}',
    )
  })

  it('lists the code of a full list and of tiers that overlap', () => {
    expect(errorCodes).toContain('catalog.limit-reached')
    expect(errorCodes).toContain('ticket-type.tiers-overlap')
  })
})
