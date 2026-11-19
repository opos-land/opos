import { describe, expect, it } from 'vitest'
import {
  addOnSchema,
  ADD_ON_KINDS,
  createAddOnSchema,
  createCustomFieldSchema,
  customFieldSchema,
  MAX_ADD_ONS,
  MAX_AMOUNT_MINOR,
  MAX_CUSTOM_FIELDS,
  updateAddOnSchema,
  updateCustomFieldSchema,
} from './catalog'
import { errorCodes } from './errors'
import { contract } from './index'

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

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

describe('the catalog of an edition', () => {
  it('holds a number of rows of each kind that one answer can carry', () => {
    expect(MAX_ADD_ONS).toBe(50)
    expect(MAX_CUSTOM_FIELDS).toBe(20)
  })

  it('is reached under the edition of the path', () => {
    const routes = [
      ...Object.values(contract.catalog.addOns),
      ...Object.values(contract.catalog.customFields),
    ].map((procedure) => procedure['~orpc'].route.path)

    expect(routes.every((path) => path?.startsWith('/editions/{editionId}/'))).toBe(true)
  })

  it('lists the code of a full list', () => {
    expect(errorCodes).toContain('catalog.limit-reached')
  })
})
