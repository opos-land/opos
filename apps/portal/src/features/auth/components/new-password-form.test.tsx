import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { AuthError } from '@supabase/auth-js'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPassword, signOutOtherSessions } from '../api/auth'
import { NewPasswordForm } from './new-password-form'

vi.mock('../api/auth', () => ({ setPassword: vi.fn(), signOutOtherSessions: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(setPassword).mockReset().mockResolvedValue(null)
  vi.mocked(signOutOtherSessions).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

async function submit(user: ReturnType<typeof userEvent.setup>, password: string) {
  const fields = [
    screen.getByLabelText(/New password/),
    screen.getByLabelText('Repeat the password'),
  ]
  for (const field of fields) {
    await user.clear(field)
    await user.type(field, password)
  }
  await user.click(screen.getByRole('button', { name: 'Save the new password' }))
}

describe('NewPasswordForm', () => {
  it('sets the password, ends the other sessions, then goes on', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(
      <I18nProvider i18n={i18n}>
        <NewPasswordForm onDone={onDone} />
      </I18nProvider>,
    )

    await submit(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledWith('correct horse')
    expect(signOutOtherSessions).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('retries only the sign-out once the password is saved', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    vi.mocked(signOutOtherSessions).mockResolvedValueOnce(
      new AuthError('rate limited', 429, 'over_request_rate_limit'),
    )
    render(
      <I18nProvider i18n={i18n}>
        <NewPasswordForm onDone={onDone} />
      </I18nProvider>,
    )

    await submit(user, 'correct horse')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()

    await submit(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledOnce()
    expect(signOutOtherSessions).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledOnce()
  })
})
