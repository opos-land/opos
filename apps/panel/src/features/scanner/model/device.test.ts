import { afterEach, describe, expect, it } from 'vitest'
import { codeFromHash, forgetDevice, pairingLink, readDevice, saveDevice } from './device'

// The phone that is a scanner (docs/specs/0007-scanner.md, D7): it keeps its token in the storage
// of the panel's origin on that phone. It is no session of an account.

const device = {
  token: 'a-token',
  name: 'Main gate',
  editionName: 'Edition 2026',
  conventionName: 'Convention A',
  timezone: 'Europe/Warsaw',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

afterEach(() => {
  localStorage.clear()
})

describe('the pairing link', () => {
  // The code travels after the `#`, which no server sees.
  it('carries the code after the #, and gives it back to the page it opens', () => {
    const link = pairingLink('https://panel.test', 'abc_DEF-123')

    expect(link).toBe('https://panel.test/scanner#abc_DEF-123')
    expect(codeFromHash(new URL(link).hash)).toBe('abc_DEF-123')
  })

  it('has no code in an address that names none', () => {
    expect(codeFromHash('')).toBeNull()
    expect(codeFromHash('#')).toBeNull()
  })
})

describe('the device', () => {
  it('is kept on the phone once paired, and forgotten when its access ends', () => {
    expect(readDevice()).toBeNull()

    saveDevice(device)
    expect(readDevice()).toEqual(device)

    forgetDevice()
    expect(readDevice()).toBeNull()
  })

  it('is nobody for a stored value that is no device', () => {
    localStorage.setItem('opos.scanner', '{"token": 1}')
    expect(readDevice()).toBeNull()
    localStorage.setItem('opos.scanner', 'not json')
    expect(readDevice()).toBeNull()
  })

  // The end a phone was told when it was paired is the one the scanner had then: the end of a
  // scanner that follows its edition moves with the edition's dates, and the API judges it at
  // every request. The phone forgets its scanner when the API says it is none.
  it('stays the scanner past the end it was told when it was paired', () => {
    const told = { ...device, expiresAt: '2020-01-01T00:00:00.000Z' }
    saveDevice(told)

    expect(readDevice()).toEqual(told)
  })
})
