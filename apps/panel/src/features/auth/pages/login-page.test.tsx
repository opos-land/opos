import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { LoginPage } from './login-page'

const renderLogin = (search: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<p>signed in</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'ready', account: null })
})

afterEach(cleanup)

describe('LoginPage ?error=', () => {
  it('shows the code of a failed Google sign-in through the catalog', () => {
    renderLogin('?error=auth.google-failed')

    expect(screen.getByRole('alert').textContent).toBe('Signing in with Google failed. Try again.')
  })

  it.each(['auth.otp_expired', 'auth.over_request_rate_limit'])('shows %s', (code) => {
    renderLogin(`?error=${code}`)

    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('shows no raw text for a value that is no code of the API', () => {
    renderLogin('?error=access_denied%20<b>boom</b>')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toContain('boom')
  })

  it('shows nothing without an error', () => {
    renderLogin('')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  it('still offers the form while the API cannot be reached', () => {
    useSession.setState({ status: 'unavailable', account: null })
    renderLogin('')

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('leaves a browser holding a session for the page it asked for', () => {
    useSession.setState({
      status: 'ready',
      account: {
        id: 'a',
        email: 'a@x.test',
        firstName: null,
        lastName: null,
        locale: null,
        mfaEnabled: false,
      },
    })
    renderLogin('?redirect=%2Fconvention-a')

    expect(screen.getByText('signed in')).toBeTruthy()
  })
})
