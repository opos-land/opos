import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { AuthApiError } from '@supabase/auth-js'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resendConfirmation, signInWithPassword } from '../api/auth'
import { SignInForm } from './sign-in-form'

vi.mock('../api/auth', () => ({ signInWithPassword: vi.fn(), resendConfirmation: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(signInWithPassword).mockReset()
  vi.mocked(resendConfirmation).mockReset()
})

afterEach(cleanup)

async function signIn(onSignedIn = vi.fn()) {
  render(
    <I18nProvider i18n={i18n}>
      <SignInForm returnTo="/privacy" onSignedIn={onSignedIn} />
    </I18nProvider>,
  )
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'anna@example.test')
  await user.type(screen.getByLabelText('Password'), 'secret password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return { user, onSignedIn }
}

describe('SignInForm', () => {
  it('signs in', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(null)

    const { onSignedIn } = await signIn()

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.test',
      password: 'secret password',
    })
    expect(onSignedIn).toHaveBeenCalledOnce()
  })

  it('offers a new confirmation link to an address not confirmed yet', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(
      new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'),
    )
    vi.mocked(resendConfirmation).mockResolvedValue(null)

    const { user, onSignedIn } = await signIn()
    await user.click(screen.getByRole('button', { name: 'Send the confirmation link again' }))

    expect(onSignedIn).not.toHaveBeenCalled()
    expect(resendConfirmation).toHaveBeenCalledWith('anna@example.test', '/privacy')
    expect(screen.getByRole('status').textContent).toBe(
      'We sent a new confirmation link to anna@example.test.',
    )
  })

  it('offers no link for wrong credentials', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    )

    await signIn()

    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.')
    expect(screen.queryByRole('button', { name: 'Send the confirmation link again' })).toBeNull()
  })
})
