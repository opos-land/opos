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
  theme: null,
  mfaEnabled: false,
}

function LoginProbe() {
  const location = useLocation()
  return <p>login {location.search}</p>
}

function MfaProbe() {
  const location = useLocation()
  return <p>mfa {location.search}</p>
}

const renderAt = (path: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/auth/mfa" element={<MfaProbe />} />
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
    renderAt('/conventions')

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('shows the page once a session is restored', () => {
    renderAt('/conventions')
    act(() => useSession.setState({ status: 'ready', account }))

    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('sends a visitor without a session to sign in, and back afterwards', () => {
    renderAt('/conventions/new')
    act(() => useSession.setState({ status: 'ready', account: null }))

    expect(screen.getByText('login ?redirect=%2Fconventions%2Fnew')).toBeTruthy()
  })

  it('sends a session waiting for its code to the code screen, not to sign-in, and shows nothing', () => {
    renderAt('/conventions/new')
    act(() => useSession.setState({ status: 'mfa-required', account: null }))

    expect(screen.getByText('mfa ?redirect=%2Fconventions%2Fnew')).toBeTruthy()
    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('offers to try again when the API could not be reached, and signs nobody out', async () => {
    const user = userEvent.setup()
    renderAt('/conventions')
    act(() => useSession.setState({ status: 'unavailable', account: null }))

    expect(screen.queryByText(/login/)).toBeNull()
    expect(screen.queryByText('the page')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(startSession).toHaveBeenCalledOnce()
  })
})

// A page to return to belongs to the account that left it: the tab remembers the
// account it last showed, and another account arriving on a page of the admin application starts from `/`.
describe('RequireSession across accounts', () => {
  const SHOWN = 'opos-admin-shown-account'
  const other = { ...account, id: 'b', email: 'b@x.test' }

  function Where() {
    return <p>at {useLocation().pathname}</p>
  }

  const at = (path: string) =>
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={
                <RequireSession>
                  <Where />
                </RequireSession>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('leads another account than the tab last showed from the page left behind to the start', () => {
    window.sessionStorage.setItem(SHOWN, 'a')
    useSession.setState({ status: 'ready', account: other })
    at('/conventions/abc')

    expect(screen.getByText('at /')).toBeTruthy()
    expect(window.sessionStorage.getItem(SHOWN)).toBe('b')
  })

  it('brings the same account back to the page it left', () => {
    window.sessionStorage.setItem(SHOWN, 'a')
    useSession.setState({ status: 'ready', account })
    at('/conventions/abc')

    expect(screen.getByText('at /conventions/abc')).toBeTruthy()
  })

  it('opens the page of a link in a tab that has shown no account yet', () => {
    useSession.setState({ status: 'ready', account: other })
    at('/conventions/abc')

    expect(screen.getByText('at /conventions/abc')).toBeTruthy()
    expect(window.sessionStorage.getItem(SHOWN)).toBe('b')
  })

  it('leads to the start when another tab replaces the account under the page', () => {
    useSession.setState({ status: 'ready', account })
    at('/conventions/abc')
    act(() => useSession.setState({ status: 'loading', account: null }))
    act(() => useSession.setState({ status: 'ready', account: other }))

    expect(screen.getByText('at /')).toBeTruthy()
  })
})
