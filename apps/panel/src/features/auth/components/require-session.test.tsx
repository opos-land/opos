import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Session } from '@supabase/auth-js'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { RequireSession } from './require-session'

function LoginProbe() {
  const location = useLocation()
  return <p>login {location.search}</p>
}

const renderAt = (path: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route
            path="*"
            element={
              <RequireSession>
                <p>the page</p>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'loading', session: null })
})

afterEach(cleanup)

describe('RequireSession', () => {
  it('shows the loading view while the session is restored, not the sign-in screen', () => {
    renderAt('/convention-a')

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('shows the page once a session is restored', () => {
    renderAt('/convention-a')
    act(() => useSession.setState({ status: 'ready', session: {} as Session }))

    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('sends a visitor without a session to sign in, and back afterwards', () => {
    renderAt('/convention-a/team')
    act(() => useSession.setState({ status: 'ready', session: null }))

    expect(screen.getByText('login ?redirect=%2Fconvention-a%2Fteam')).toBeTruthy()
  })
})
