import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { AuthError } from '@supabase/auth-js'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exchangeCode, setPassword, signOutOtherSessions } from '../api/auth'
import { ResetPasswordPage } from './reset-password-page'

vi.mock('../api/auth', () => ({
  exchangeCode: vi.fn(),
  setPassword: vi.fn(),
  signOutOtherSessions: vi.fn(),
}))

function renderAt(search: string) {
  window.history.replaceState(null, '', `/reset-password${search}`)
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(exchangeCode).mockReset().mockResolvedValue(null)
  vi.mocked(setPassword).mockReset().mockResolvedValue(null)
  vi.mocked(signOutOtherSessions).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

describe('ResetPasswordPage', () => {
  it('exchanges the code, sets the password and ends the other sessions', async () => {
    const user = userEvent.setup()
    renderAt('?code=abc')

    await user.type(await screen.findByLabelText(/New password/), 'correct horse')
    await user.type(screen.getByLabelText('Repeat the password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Save the new password' }))

    expect(exchangeCode).toHaveBeenCalledWith('abc')
    expect(setPassword).toHaveBeenCalledWith('correct horse')
    expect(signOutOtherSessions).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe(
      'Your new password is saved. You are signed out on every other device.',
    )
  })

  it('offers a new link when the code does not work', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(
      new AuthError('verifier missing', 400, 'pkce_code_verifier_not_found'),
    )
    renderAt('?code=abc')

    const link = await screen.findByRole('link', { name: 'Ask for a new link' })
    expect(link.getAttribute('href')).toBe('/forgot-password')
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('offers a new link when opened without a code', () => {
    renderAt('')

    expect(screen.getByRole('alert').textContent).toBe('The link has expired. Ask for a new one.')
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
