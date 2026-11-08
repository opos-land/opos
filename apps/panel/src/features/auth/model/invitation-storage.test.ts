import { beforeEach, describe, expect, it } from 'vitest'
import {
  endsInvitation,
  forgetInvitation,
  INVITATION_STORAGE_KEY,
  rememberInvitation,
  storedInvitation,
} from './invitation-storage'

beforeEach(() => {
  localStorage.clear()
})

describe('the stored invitation', () => {
  it('is empty until a token is remembered', () => {
    expect(storedInvitation()).toBeNull()
  })

  it('keeps the token across a reload, under its storage key', () => {
    rememberInvitation('token-a')

    expect(JSON.parse(localStorage.getItem(INVITATION_STORAGE_KEY)!)).toEqual({
      token: 'token-a',
    })
    expect(storedInvitation()).toEqual({ token: 'token-a' })
  })

  it('survives the confirmation link opening the page again with the same token', () => {
    rememberInvitation('token-a')

    expect(rememberInvitation('token-a')).toEqual({ token: 'token-a' })
  })

  it('starts over for another token', () => {
    rememberInvitation('token-a')

    expect(rememberInvitation('token-b')).toEqual({ token: 'token-b' })
  })

  it('is gone once accepted', () => {
    rememberInvitation('token-a')
    forgetInvitation()

    expect(storedInvitation()).toBeNull()
  })

  it('ignores an entry it cannot read', () => {
    localStorage.setItem(INVITATION_STORAGE_KEY, 'not json')
    expect(storedInvitation()).toBeNull()

    localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ other: true }))
    expect(storedInvitation()).toBeNull()
  })
})

describe('endsInvitation', () => {
  it.each([
    'invitation.invalid',
    'invitation.expired',
    'invitation.used',
    'invitation.revoked',
    'invitation.already-member',
  ])('is true for %s', (code) => {
    expect(endsInvitation(code)).toBe(true)
  })

  it.each(['invitation.email-mismatch', 'server.error', 'auth.otp_expired', undefined])(
    'is false for %s',
    (code) => {
      expect(endsInvitation(code)).toBe(false)
    },
  )
})
