import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetInvitation,
  INVITATION_STORAGE_KEY,
  rememberInvitation,
  setAwaitingPassword,
  storedInvitation,
  throwawayPassword,
} from './invitation-storage'

beforeEach(() => {
  localStorage.clear()
})

describe('the stored invitation', () => {
  it('is empty until a token is remembered', () => {
    expect(storedInvitation()).toBeNull()
  })

  it('keeps the token across a reload, under the key of PLAN.md 7.7', () => {
    rememberInvitation('token-a')

    expect(JSON.parse(localStorage.getItem(INVITATION_STORAGE_KEY)!)).toEqual({
      token: 'token-a',
      awaitingPassword: false,
    })
    expect(storedInvitation()).toEqual({ token: 'token-a', awaitingPassword: false })
  })

  it('survives the confirmation round trip waiting for a password', () => {
    rememberInvitation('token-a')
    setAwaitingPassword(true)

    // The confirmation link opens the page again with the same token.
    expect(rememberInvitation('token-a')).toEqual({ token: 'token-a', awaitingPassword: true })
    expect(storedInvitation()?.awaitingPassword).toBe(true)
  })

  it('starts over for another token', () => {
    rememberInvitation('token-a')
    setAwaitingPassword(true)

    expect(rememberInvitation('token-b')).toEqual({ token: 'token-b', awaitingPassword: false })
  })

  it('marks nothing when no invitation is stored', () => {
    setAwaitingPassword(true)

    expect(storedInvitation()).toBeNull()
  })

  it('is gone once accepted', () => {
    rememberInvitation('token-a')
    forgetInvitation()

    expect(storedInvitation()).toBeNull()
  })

  it('ignores an entry it cannot read', () => {
    localStorage.setItem(INVITATION_STORAGE_KEY, 'not json')
    expect(storedInvitation()).toBeNull()

    localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ awaitingPassword: true }))
    expect(storedInvitation()).toBeNull()
  })
})

describe('throwawayPassword', () => {
  it('is long and different every time', () => {
    const a = throwawayPassword()

    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(throwawayPassword()).not.toBe(a)
  })
})
