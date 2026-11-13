import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { LoginPage } from './login-page'

// The theme toggle has tests of its own.
vi.mock('../../theme', () => ({ ThemeToggle: () => null }))

const renderLogin = (search = '') =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/log" element={<p>the log</p>} />
          <Route path="*" element={<p>start page</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

const account = {
  id: 'a',
  email: 'ada@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: true,
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'ready', account: null })
})

afterEach(cleanup)

describe('LoginPage', () => {
  it('asks for the email address and the password', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Sign in to OPOS administration' })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText(/^Only OPOS administrators sign in here/)).toBeTruthy()
  })

  // The API serves the admin application's origin none of these: an admin's account is made, and
  // its password and second factor changed, in the portal.
  it('offers no sign-up, no Google sign-in and no password reset', () => {
    renderLogin()

    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Sign in'])
    expect(screen.queryByText(/google/i)).toBeNull()
    expect(screen.queryByText(/forgot/i)).toBeNull()
  })

  it('shows no text of the address: an error in it is no message of the API', () => {
    renderLogin('?error=%3Cb%3Ehello%3C%2Fb%3E')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/hello/)).toBeNull()
  })

  it('shows a loading view, not the form, while the session is asked for', () => {
    useSession.setState({ status: 'loading', account: null })
    renderLogin()

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('still offers the form while the API cannot be reached', () => {
    useSession.setState({ status: 'unavailable', account: null })
    renderLogin()

    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('leaves a browser holding a session for the page it asked for', () => {
    useSession.setState({ status: 'ready', account })
    renderLogin('?redirect=%2Flog')

    expect(screen.getByText('the log')).toBeTruthy()
  })

  it.each(['//evil.test', 'https://evil.test', '/.//evil.test'])(
    'leads to the start page for the target %s, which is no path of the admin application',
    (target) => {
      useSession.setState({ status: 'ready', account })
      renderLogin(`?redirect=${encodeURIComponent(target)}`)

      expect(screen.getByText('start page')).toBeTruthy()
    },
  )

  it('follows a session that arrives while the form is shown', () => {
    renderLogin('?redirect=%2Flog')
    expect(screen.getByLabelText('Password')).toBeTruthy()

    act(() => useSession.setState({ status: 'ready', account }))

    expect(screen.getByText('the log')).toBeTruthy()
  })
})
