import { DOCUMENT_KINDS, MAX_DOCUMENT_SIZE, SHOP_CONDITIONS } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import {
  CONDITION_LABELS,
  documentProblem,
  fileSize,
  KIND_LABELS,
  missingConditions,
  versionUrl,
} from './documents'

const file = (bytes: number, type: string, name = 'terms.pdf') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('documentProblem', () => {
  it('takes a PDF up to the limit, and refuses one a byte over', () => {
    expect(documentProblem(file(10, 'application/pdf'))).toBeNull()
    expect(documentProblem({ type: 'application/pdf', size: MAX_DOCUMENT_SIZE } as File)).toBeNull()
    expect(documentProblem({ type: 'application/pdf', size: MAX_DOCUMENT_SIZE + 1 } as File)).toBe(
      'size',
    )
  })

  it.each(['image/png', 'application/msword', 'text/plain', ''])(
    'refuses a file of the type %j',
    (type) => {
      expect(documentProblem(file(10, type))).toBe('type')
    },
  )
})

describe('versionUrl', () => {
  it("names the convention and the version under the API's address", () => {
    expect(
      versionUrl(
        'http://api.opos.localhost:3001/',
        'convention-a',
        '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60',
      ),
    ).toBe(
      'http://api.opos.localhost:3001/public/tenants/convention-a/document-versions/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60',
    )
  })
})

describe('fileSize', () => {
  it.each([
    [512, 'en', '512 byte'],
    [2048, 'en', '2 kB'],
    [1536, 'en', '1.5 kB'],
    [5 * 1024 * 1024, 'en', '5 MB'],
    [1536, 'pl', '1,5 kB'],
  ])('words %i bytes in %s as %s', (bytes, locale, text) => {
    expect(fileSize(bytes, locale)).toBe(text)
  })
})

describe('the labels', () => {
  it('name every kind of document and every condition of opening', () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual([...DOCUMENT_KINDS].sort())
    expect(Object.keys(CONDITION_LABELS).sort()).toEqual([...SHOP_CONDITIONS].sort())
  })
})

describe('missingConditions', () => {
  it('reads the conditions a refused opening names, in the order of the contract', () => {
    const error = new ORPCError('shop.not-ready', {
      status: 409,
      data: { 'privacy-policy': 'missing', 'provider-account': 'missing' },
    })

    expect(missingConditions(error)).toEqual(['provider-account', 'privacy-policy'])
  })

  it('reads none from another refusal, nor from a failure', () => {
    expect(missingConditions(new ORPCError('shop.open', { status: 409 }))).toEqual([])
    expect(missingConditions(new Error('offline'))).toEqual([])
  })
})
