import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { startSession, useSession } from '../../../shared/lib/session'
import { RequireSession } from './require-session'

vi.mock(import('../../../shared/lib/session'), async (importOriginal) => ({
  ...(await importOriginal()),
  startSession: vi.fn(),
}))

const account = {
  id: 'a',
  email: 'a@x.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
}

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
  useSession.setState({ status: 'loading', account: null })
})

afterEach(cleanup)

describe('RequireSession', () => {
  it('shows the loading view while the session is restored, not the sign-in screen', () => {
    renderAt('/account')

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('shows the page once a session is restored', () => {
    renderAt('/account')
    act(() => useSession.setState({ status: 'ready', account }))

    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('sends a visitor without a session to sign in, and back afterwards', () => {
    renderAt('/account?tab=profile')
    act(() => useSession.setState({ status: 'ready', account: null }))

    expect(screen.getByText('login ?redirect=%2Faccount%3Ftab%3Dprofile')).toBeTruthy()
  })

  it('offers to try again when the API could not be reached, and signs nobody out', async () => {
    const user = userEvent.setup()
    renderAt('/account')
    act(() => useSession.setState({ status: 'unavailable', account: null }))

    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(startSession).toHaveBeenCalledOnce()
  })
})
