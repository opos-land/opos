import { describe, expect, it } from 'vitest'
import { sellerBody, sellerFormSchema, sellerValues } from './seller-form'

const seller = {
  sellerName: 'Convention A Foundation',
  sellerAddress: 'ul. Przykładowa 1, 61-001 Poznań',
  sellerRegistrationNumber: 'KRS 0000000000',
  contactEmail: 'shop@convention-a.test',
}

describe("the form of the seller's details", () => {
  it('shows a part that is not set as an empty field', () => {
    expect(
      sellerValues({
        ...seller,
        sellerAddress: null,
        contactEmail: null,
        currency: 'PLN',
        complete: false,
      }),
    ).toEqual({ ...seller, sellerAddress: '', contactEmail: '' })
  })

  it('sends an emptied field as a part cleared, and the rest trimmed', () => {
    expect(
      sellerBody({ ...seller, sellerName: '  Convention A Foundation ', sellerAddress: '   ' }),
    ).toEqual({ ...seller, sellerAddress: null })
  })

  it('takes every part empty: the details may be saved before they are complete', () => {
    const empty = {
      sellerName: '',
      sellerAddress: '',
      sellerRegistrationNumber: '',
      contactEmail: '',
    }

    expect(sellerFormSchema.safeParse(empty).success).toBe(true)
    expect(sellerBody(empty)).toEqual({
      sellerName: null,
      sellerAddress: null,
      sellerRegistrationNumber: null,
      contactEmail: null,
    })
  })

  it.each([
    ['a name over 200 characters', { sellerName: 'n'.repeat(201) }, 'sellerName'],
    ['an address over 500 characters', { sellerAddress: 'a'.repeat(501) }, 'sellerAddress'],
    [
      'a number over 50 characters',
      { sellerRegistrationNumber: '1'.repeat(51) },
      'sellerRegistrationNumber',
    ],
    ['a contact that is no email address', { contactEmail: 'shop' }, 'contactEmail'],
  ])('refuses %s, at its field', (_, change, field) => {
    const result = sellerFormSchema.safeParse({ ...seller, ...change })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([field])
  })
})
