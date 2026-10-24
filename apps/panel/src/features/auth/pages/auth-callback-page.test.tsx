import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { AuthError } from '@supabase/auth-js'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exchangeCode } from '../api/auth'
import { AUTH_RETURN_STORAGE_KEY, rememberAuthReturn } from '../model/auth-return'
import { rememberInvitation, setAwaitingPassword } from '../model/invitation-storage'
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
  it('opens the page the sign-in started on', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(null)
    rememberAuthReturn('/convention-a/team')

    renderCallback('?code=abc')

    expect(await screen.findByText('at /convention-a/team')).toBeTruthy()
    expect(exchangeCode).toHaveBeenCalledWith('abc')
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull()
  })

  it('is not taken over by an invitation that waits for nothing', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(null)
    rememberInvitation('token-a')

    renderCallback('?code=abc')

    expect(await screen.findByText('at /')).toBeTruthy()
  })

  it('returns to an invitation waiting for its password link', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(null)
    rememberInvitation('token-a')
    setAwaitingPassword(true)

    renderCallback('?code=abc')

    expect(await screen.findByText('at /invitation')).toBeTruthy()
  })

  it('offers sign-in, with the page to return to, when the code fails', async () => {
    vi.mocked(exchangeCode).mockResolvedValue(
      new AuthError('verifier missing', 400, 'pkce_code_verifier_not_found'),
    )
    rememberAuthReturn('/convention-a/team')

    renderCallback('?code=abc')

    const link = await screen.findByRole('link', { name: 'Back to sign-in' })
    expect(link.getAttribute('href')).toBe('/login?redirect=%2Fconvention-a%2Fteam')
    expect(screen.queryByRole('link', { name: 'Back to the invitation' })).toBeNull()
  })

  it('offers the invitation back when the round trip started there', () => {
    rememberAuthReturn('/invitation')

    renderCallback('?error=access_denied&error_code=otp_expired')

    expect(screen.getByRole('link', { name: 'Back to the invitation' })).toBeTruthy()
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
