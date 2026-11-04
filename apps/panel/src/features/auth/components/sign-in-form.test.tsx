import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithPassword } from '../api/auth'
import { SignInForm } from './sign-in-form'

vi.mock('../api/auth', () => ({ signInWithPassword: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(signInWithPassword).mockReset()
})

afterEach(cleanup)

async function signIn(onSignedIn = vi.fn(), onMfaRequired = vi.fn()) {
  render(
    <I18nProvider i18n={i18n}>
      <SignInForm onSignedIn={onSignedIn} onMfaRequired={onMfaRequired} />
    </I18nProvider>,
  )
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'anna@example.test')
  await user.type(screen.getByLabelText('Password'), 'secret password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return onSignedIn
}

describe('SignInForm', () => {
  it('signs in', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(null)

    const onSignedIn = await signIn()

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.test',
      password: 'secret password',
    })
    expect(onSignedIn).toHaveBeenCalledOnce()
  })

  it('shows no error when the account wants its code: the code screen follows', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(
      new ORPCError('session.mfa-required', { status: 401 }),
    )

    const onMfaRequired = vi.fn()
    const onSignedIn = await signIn(vi.fn(), onMfaRequired)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSignedIn).not.toHaveBeenCalled()
    expect(onMfaRequired).toHaveBeenCalledOnce()
  })

  it('shows the message of a wrong password', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(
      new ORPCError('auth.invalid_credentials', { status: 400 }),
    )

    await signIn()

    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.')
  })
})
