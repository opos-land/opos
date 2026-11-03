import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetLostCodes,
  LOST_CODES_STORAGE_KEY,
  lostCodesRemembered,
  rememberLostCodes,
} from './lost-codes'

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the notice about recovery codes that were never shown', () => {
  it('is remembered until it is forgotten, as a flag that holds no code', () => {
    expect(lostCodesRemembered()).toBe(false)

    rememberLostCodes()

    expect(lostCodesRemembered()).toBe(true)
    expect(sessionStorage.getItem(LOST_CODES_STORAGE_KEY)).toBe('1')
    forgetLostCodes()
    expect(lostCodesRemembered()).toBe(false)
  })

  it('lives in the tab only, not in storage that outlasts it', () => {
    rememberLostCodes()

    expect(localStorage.getItem(LOST_CODES_STORAGE_KEY)).toBeNull()
  })

  it('is lost quietly where storage is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => rememberLostCodes()).not.toThrow()
    expect(lostCodesRemembered()).toBe(false)
    expect(() => forgetLostCodes()).not.toThrow()
  })
})
