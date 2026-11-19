import { describe, expect, it } from 'vitest'
import {
  consentSchema,
  createConsentSchema,
  createDocumentSchema,
  DOCUMENT_KINDS,
  DOCUMENT_TYPES,
  documentSchema,
  editionShopSchema,
  MAX_DOCUMENT_SIZE,
  REQUIRED_DOCUMENT_KINDS,
  SHOP_CONDITIONS,
  updateConsentSchema,
  updateDocumentSchema,
  updateEditionShopSchema,
} from './edition-shop'
import { errorCodes } from './errors'
import { MAX_FILE_SIZE } from './files'
import { contract } from './index'

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe('the shop of an edition', () => {
  it('asks for the provider account, the details of the seller and two documents to open', () => {
    expect([...SHOP_CONDITIONS]).toEqual([
      'provider-account',
      'seller-details',
      'shop-terms',
      'privacy-policy',
    ])
    expect(Object.keys(editionShopSchema.shape.conditions.shape)).toEqual([...SHOP_CONDITIONS])
  })

  // The conditions are a yes or a no each: an org with the tickets permission alone learns no
  // more of the convention's provider account and seller's details.
  it('answers each condition as a yes or a no, and nothing of what stands behind it', () => {
    expect(Object.keys(editionShopSchema.shape).sort()).toEqual([
      'conditions',
      'faqUrl',
      'open',
      'openedAt',
    ])
    refused(
      editionShopSchema.safeParse({
        open: false,
        openedAt: null,
        faqUrl: null,
        conditions: {
          'provider-account': 'fake',
          'seller-details': true,
          'shop-terms': true,
          'privacy-policy': true,
        },
      }),
    )
  })

  it('takes the address of the FAQ as a page on the web, or none', () => {
    expect(updateEditionShopSchema.parse({ faqUrl: 'https://convention.test/faq' })).toEqual({
      faqUrl: 'https://convention.test/faq',
    })
    expect(updateEditionShopSchema.parse({ faqUrl: null })).toEqual({ faqUrl: null })
    expect(updateEditionShopSchema.parse({})).toEqual({})
  })

  it.each([
    ['an address that is no link', { faqUrl: 'faq' }],
    ['a link a browser would run', { faqUrl: 'javascript:alert(1)' }],
    ['a link to a file of the device', { faqUrl: 'file:///etc/passwd' }],
    ['a link over 2000 characters', { faqUrl: `https://convention.test/${'a'.repeat(2000)}` }],
    ['the moment it was opened', { openedAt: '2027-06-01T08:00:00.000Z' }],
  ])('refuses %s', (_, body) => {
    refused(updateEditionShopSchema.safeParse(body))
  })
})

describe('a legal document', () => {
  it('is of a kind OPOS knows, two of which opening the shop asks for', () => {
    expect([...DOCUMENT_KINDS]).toEqual(['shop-terms', 'privacy-policy', 'edition-rules', 'other'])
    expect([...REQUIRED_DOCUMENT_KINDS]).toEqual(['shop-terms', 'privacy-policy'])
  })

  it('takes its versions as a PDF alone, within what the storage keeps', () => {
    expect([...DOCUMENT_TYPES]).toEqual(['application/pdf'])
    expect(MAX_DOCUMENT_SIZE).toBeLessThanOrEqual(MAX_FILE_SIZE)
  })

  it('is added with a kind and a trimmed title', () => {
    expect(createDocumentSchema.parse({ kind: 'shop-terms', title: ' Terms ' })).toEqual({
      kind: 'shop-terms',
      title: 'Terms',
    })
  })

  it.each([
    ['a kind OPOS does not know', { kind: 'cookies', title: 'Cookies' }],
    ['an empty title', { kind: 'other', title: ' ' }],
    ['a title over 200 characters', { kind: 'other', title: 't'.repeat(201) }],
    ['a field of its own', { kind: 'other', title: 'Rules', hidden: true }],
  ])('is not added with %s', (_, body) => {
    refused(createDocumentSchema.safeParse(body))
  })

  it('keeps its kind: a change names its title and whether the shop shows it', () => {
    expect(Object.keys(updateDocumentSchema.shape).sort()).toEqual(['hidden', 'title'])
    refused(updateDocumentSchema.safeParse({ kind: 'other' }))
  })

  it('answers its versions with the name and size of their files, and no place in the bucket', () => {
    expect(Object.keys(documentSchema.shape.versions.element.shape).sort()).toEqual([
      'file',
      'id',
      'number',
      'publishedAt',
    ])
    expect(Object.keys(documentSchema.shape.versions.element.shape.file.shape).sort()).toEqual([
      'name',
      'size',
    ])
  })

  it('has no route that changes or removes a published version', () => {
    const routes = Object.values(contract.shop.documents).map(
      (procedure) => procedure['~orpc'].route,
    )
    const ofVersions = routes.filter((route) => route.path?.includes('/versions'))

    expect(ofVersions.map((route) => [route.method, route.path])).toEqual([
      ['POST', '/editions/{editionId}/documents/{documentId}/versions'],
    ])
  })
})

describe('a consent', () => {
  it('is added with its sentence and whether it is required, and may link a document', () => {
    expect(createConsentSchema.parse({ text: ' I accept. ', isRequired: true })).toEqual({
      text: 'I accept.',
      isRequired: true,
    })
    expect(
      createConsentSchema.safeParse({
        text: 'I accept',
        isRequired: false,
        documentId: '0198c1a0-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true)
  })

  it.each([
    ['an empty sentence', { text: ' ', isRequired: true }],
    ['a sentence over 1000 characters', { text: 's'.repeat(1001), isRequired: true }],
    ['no word on whether it is required', { text: 'I accept' }],
    ['a place of its own choosing', { text: 'I accept', isRequired: true, position: 1 }],
  ])('is not added with %s', (_, body) => {
    refused(createConsentSchema.safeParse(body))
  })

  // A column that points at another row is set with its row and never changed: a consent that
  // should link another document is a new consent.
  it('links its document for good: a change names no document', () => {
    expect(Object.keys(updateConsentSchema.shape).sort()).toEqual([
      'hidden',
      'isRequired',
      'position',
      'text',
    ])
    refused(updateConsentSchema.safeParse({ documentId: null }))
    refused(updateConsentSchema.safeParse({ documentId: '0198c1a0-0000-7000-8000-000000000001' }))
  })

  it('moves to a place counted from 1', () => {
    expect(updateConsentSchema.parse({ position: 3 })).toEqual({ position: 3 })
    refused(updateConsentSchema.safeParse({ position: 0 }))
    refused(updateConsentSchema.safeParse({ position: 1.5 }))
  })

  it('answers its place, its document and whether the shop shows it', () => {
    expect(Object.keys(consentSchema.shape).sort()).toEqual([
      'documentId',
      'editionId',
      'hidden',
      'id',
      'isRequired',
      'position',
      'text',
    ])
  })
})

describe("the codes of an edition's shop", () => {
  it.each([
    'document.in-use',
    'document.too-many',
    'document.too-many-versions',
    'consent.too-many',
  ])('list %s', (code) => {
    expect(errorCodes).toContain(code)
  })
})
