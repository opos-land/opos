import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetDeletionConfirmation,
  googleReturn,
  rememberDeletionConfirmation,
  startedDeletionConfirmation,
} from './deletion-confirmation'

beforeEach(() => {
  window.localStorage.clear()
})

describe('googleReturn', () => {
  it('confirms the account that started the confirmation', () => {
    expect(googleReturn('user-a', 'user-a')).toBe('confirmed')
  })

  it('tells apart another account Google signed in', () => {
    expect(googleReturn('user-a', 'user-b')).toBe('other-account')
  })

  it('confirms nothing that was not started in this browser', () => {
    expect(googleReturn(null, 'user-a')).toBe('none')
  })
})

describe('the stored confirmation', () => {
  it('is remembered until it is forgotten', () => {
    rememberDeletionConfirmation('user-a')
    expect(startedDeletionConfirmation()).toBe('user-a')

    forgetDeletionConfirmation()
    expect(startedDeletionConfirmation()).toBeNull()
  })
})
