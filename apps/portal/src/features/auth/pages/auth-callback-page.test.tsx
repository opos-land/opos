import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { AuthError } from '@supabase/auth-js'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exchangeCode } from '../api/auth'
import { AUTH_RETURN_STORAGE_KEY, rememberAuthReturn } from '../model/auth-return'
import { AuthCallbackPage } from './auth-callback-page'

vi.mock('../api/auth', () => ({ exchangeCode: vi.fn() }))

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderCallback(search: string) {
  window.history.replaceState(null, '', `/auth/callback${search}`)
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  vi.mocked(exchangeCode).mockReset()
})

afterEach(cleanup)

describe('AuthCallbackPage', () => {
  it('opens the page the round trip started on, once', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(null)
    rememberAuthReturn('/privacy')

    renderCallback('?code=abc')

    expect(await screen.findByText('at /privacy')).toBeTruthy()
    expect(exchangeCode).toHaveBeenCalledWith('abc')
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull()
  })

  it('opens the account page when nothing started a round trip', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(null)

    renderCallback('?code=abc')

    expect(await screen.findByText('at /account')).toBeTruthy()
  })

  it('offers sign-in, with the page to return to, when the code fails', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(
      new AuthError('verifier missing', 400, 'pkce_code_verifier_not_found'),
    )
    rememberAuthReturn('/privacy')

    renderCallback('?code=abc')

    const link = await screen.findByRole('link', { name: 'Go to sign-in' })
    expect(link.getAttribute('href')).toBe('/login?redirect=%2Fprivacy')
    expect(screen.getByRole('alert').textContent).toBe(
      'Open the link in the browser where you asked for it, or ask for a new link there.',
    )
  })

  it('exchanges nothing for a link Supabase Auth reports as failed', () => {
    renderCallback('?error=access_denied&error_code=otp_expired')

    expect(screen.getByRole('alert').textContent).toBe('The link has expired. Ask for a new one.')
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
