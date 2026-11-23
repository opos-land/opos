import { describe, expect, it } from 'vitest'
import { type ContractMeta } from './common'
import {
  createScannerSchema,
  MAX_SCANNERS,
  PAIRING_MINUTES,
  scanHandOutSchema,
  scannerContract,
  scannersContract,
  scanSchema,
} from './scanner'

// The scanners of an edition and what a scanner asks (docs/specs/0007-scanner.md).

describe('enabling a scanner', () => {
  it('takes a name of up to 60 characters, and an earlier end when the org sets one', () => {
    expect(createScannerSchema.parse({ name: '  Main gate ' })).toEqual({ name: 'Main gate' })
    expect(
      createScannerSchema.parse({ name: 'Desk', expiresAt: '2026-06-05T18:00:00.000Z' }),
    ).toEqual({ name: 'Desk', expiresAt: '2026-06-05T18:00:00.000Z' })
    for (const body of [{}, { name: '  ' }, { name: 'n'.repeat(61) }, { name: 'A', token: 'x' }]) {
      expect(createScannerSchema.safeParse(body).success).toBe(false)
    }
  })

  it('allows 20 scanners an edition, and a pairing code 15 minutes', () => {
    expect(MAX_SCANNERS).toBe(20)
    expect(PAIRING_MINUTES).toBe(15)
  })
})

describe('what a scanner sends', () => {
  const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const [order, line] = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]

  // A scanner reads QR codes alone: it searches no order by a name, an email or a number.
  it('reads a QR code, and nothing else', () => {
    expect(scanSchema.parse({ code })).toEqual({ code })
    for (const body of [{}, { code: 'Ada Lovelace' }, { code, email: 'a@b.test' }]) {
      expect(scanSchema.safeParse(body).success).toBe(false)
    }
  })

  it('hands out lines of one order of the code it read, each named once', () => {
    const handOut = { code, orderId: order, lineIds: [line] }
    expect(scanHandOutSchema.parse(handOut)).toEqual(handOut)
    for (const body of [
      { ...handOut, lineIds: [] },
      { ...handOut, lineIds: [line, line] },
      { orderId: order, lineIds: [line] },
      { ...handOut, orderId: 'ABCDEFGHJK' },
    ]) {
      expect(scanHandOutSchema.safeParse(body).success).toBe(false)
    }
  })
})

describe('the routes of a scanner', () => {
  const meta = (procedure: unknown) =>
    (procedure as { '~orpc': { meta: ContractMeta } })['~orpc'].meta

  // A device is no account and no member: its routes are a kind of their own.
  it('are a kind of their own, and the org’s are tenant routes', () => {
    expect(meta(scannerContract.scan)).toMatchObject({ scanner: true })
    expect(meta(scannerContract.handOut)).toMatchObject({ scanner: true })
    expect(meta(scannerContract.pair).scanner).toBeUndefined()
    for (const route of Object.values(scannersContract)) {
      expect(meta(route)).toMatchObject({ tenant: true })
    }
  })

  // A secret never travels in a path or a query, where a log would keep it.
  it('take a pairing code and a QR code in the body alone', () => {
    for (const route of Object.values(scannerContract)) {
      const { method, path } = (route as { '~orpc': { route: { method: string; path: string } } })[
        '~orpc'
      ].route
      expect(method).toBe('POST')
      expect(path).not.toMatch(/\{/)
    }
  })
})
