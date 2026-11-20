import { describe, expect, it } from 'vitest'
import { errorCodes } from './errors'
import {
  PAYMENT_PROVIDERS,
  providerAccountSchema,
  providerAccountStateSchema,
  putProviderAccountSchema,
  putSellerSchema,
  sellerSchema,
} from './shop'

const seller = {
  sellerName: 'Convention A Foundation',
  sellerAddress: 'ul. Przykładowa 1, 00-001 Warszawa',
  sellerRegistrationNumber: 'KRS 0000000000',
  contactEmail: 'shop@convention-a.test',
}

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe("the seller's details", () => {
  it('are the name, the address, the register or tax number and the contact address', () => {
    expect(Object.keys(putSellerSchema.shape).sort()).toEqual(Object.keys(seller).sort())
  })

  it('are trimmed, and a part is cleared with null', () => {
    expect(
      putSellerSchema.parse({
        ...seller,
        sellerName: '  Convention A Foundation ',
        contactEmail: null,
      }),
    ).toEqual({ ...seller, contactEmail: null })
  })

  it.each([
    ['a part left out', { sellerName: undefined }],
    ['an empty name', { sellerName: '' }],
    ['a name of spaces alone', { sellerName: '   ' }],
    ['a name over 200 characters', { sellerName: 'n'.repeat(201) }],
    ['an address over 500 characters', { sellerAddress: 'a'.repeat(501) }],
    ['a number over 50 characters', { sellerRegistrationNumber: '1'.repeat(51) }],
    ['a contact that is no email address', { contactEmail: 'shop' }],
    ['a currency of its own', { currency: 'EUR' }],
  ])('refuse %s', (_, change) => {
    refused(putSellerSchema.safeParse({ ...seller, ...change }))
  })

  it('answer whether they are complete, and the currency the convention sells in', () => {
    expect(Object.keys(sellerSchema.shape).sort()).toEqual(
      [...Object.keys(seller), 'complete', 'currency'].sort(),
    )
    refused(sellerSchema.safeParse({ ...seller, complete: true, currency: 'EUR' }))
  })
})

describe('the provider account', () => {
  it('names a provider OPOS has a module of', () => {
    expect([...PAYMENT_PROVIDERS]).toEqual(['fake', 'przelewy24'])
    refused(putProviderAccountSchema.safeParse({ provider: 'cash', credentials: { key: 'value' } }))
  })

  it('takes the credentials as the fields its provider asks for', () => {
    const body = { provider: 'fake', credentials: { account: 'demo' } }

    expect(putProviderAccountSchema.parse(body)).toEqual(body)
  })

  it.each([
    ['no credentials', { provider: 'fake' }],
    ['credentials with no field', { provider: 'fake', credentials: {} }],
    ['an empty value', { provider: 'fake', credentials: { account: '' } }],
    [
      'a value over 500 characters',
      { provider: 'fake', credentials: { account: 'x'.repeat(501) } },
    ],
    [
      'more than 20 fields',
      {
        provider: 'fake',
        credentials: Object.fromEntries(Array.from({ length: 21 }, (_, n) => [`f${n}`, 'v'])),
      },
    ],
    [
      'a field of its own beside them',
      { provider: 'fake', credentials: { account: 'a' }, ready: true },
    ],
  ])('refuses %s', (_, body) => {
    refused(putProviderAccountSchema.safeParse(body))
  })

  // The credentials are given and never answered: an answer names the provider, when the account
  // was connected and whether it is ready to sell.
  it('answers nothing of the credentials', () => {
    expect(Object.keys(providerAccountSchema.shape).sort()).toEqual([
      'connectedAt',
      'missing',
      'provider',
      'ready',
    ])
    const parsed = providerAccountSchema.parse({
      provider: 'fake',
      connectedAt: '2027-06-01T08:00:00.000Z',
      ready: true,
      missing: [],
      credentials: { account: 'demo' },
    })
    expect(parsed).not.toHaveProperty('credentials')
  })
})

describe('the state of the provider account', () => {
  it('names the providers the environment has a module of, beside the account or none', () => {
    expect(Object.keys(providerAccountStateSchema.shape).sort()).toEqual([
      'account',
      'callsFrom',
      'providers',
    ])
    const state = { account: null, providers: ['fake'], callsFrom: null }
    expect(providerAccountStateSchema.parse(state)).toEqual(state)
    refused(providerAccountStateSchema.safeParse({ ...state, providers: ['cash'] }))
    refused(providerAccountStateSchema.safeParse({ account: null, callsFrom: null }))
  })

  // A provider that answers only to the addresses entered in its panel: the org reads here which
  // one to enter, where the environment has one.
  it('tells the address the API calls a provider from, or none', () => {
    const state = { account: null, providers: ['przelewy24'], callsFrom: '203.0.113.7' }

    expect(providerAccountStateSchema.parse(state)).toEqual(state)
    refused(providerAccountStateSchema.safeParse({ account: null, providers: [] }))
  })
})

describe('the codes of the shop', () => {
  it.each(['shop.open', 'shop.not-ready', 'provider.credentials-refused', 'provider.unavailable'])(
    'list %s',
    (code) => {
      expect(errorCodes).toContain(code)
    },
  )
})
