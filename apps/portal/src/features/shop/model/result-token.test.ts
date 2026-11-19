import { beforeEach, describe, expect, it } from 'vitest'
import { keepResultToken, resultToken } from './result-token'

describe('the result token of an order', () => {
  beforeEach(() => window.sessionStorage.clear())

  // The tab that placed the order opens its result page: the token is kept there and nowhere else.
  it('is kept in the tab for its order, and read back', () => {
    keepResultToken('order-1', 'token-1')

    expect(resultToken('order-1')).toBe('token-1')
    expect(resultToken('order-2')).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it('is taken from the address the buyer returned to, which then holds it no longer', () => {
    window.history.replaceState(null, '', '/conventions/a/2026/shop/result/order-1?token=t-9&x=1')

    expect(resultToken('order-1')).toBe('t-9')

    expect(window.location.search).toBe('?x=1')
    expect(resultToken('order-1')).toBe('t-9')
  })
})
