import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../shared/lib/session'
import { Layout } from './layout'

vi.mock('../features/account', () => ({ AccountLocale: () => null }))

const account = {
  id: 'a',
  email: 'a@x.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
}

const view = (path = '/') =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Layout />
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

describe('Layout', () => {
  it('offers sign-in to a visitor without a session', () => {
    view()

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  it('offers to finish signing in, not to sign in, to a session waiting for its code', () => {
    useSession.setState({ status: 'mfa-required', account: null })
    view('/conventions/convention-a?day=2')

    const link = screen.getByRole('link', { name: 'Finish signing in' })
    expect(link.getAttribute('href')).toBe(
      '/auth/mfa?redirect=%2Fconventions%2Fconvention-a%3Fday%3D2',
    )
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Account' })).toBeNull()
  })

  it('offers nothing to finish on the code screen itself', () => {
    useSession.setState({ status: 'mfa-required', account: null })
    view('/auth/mfa')

    expect(screen.queryByRole('link', { name: 'Finish signing in' })).toBeNull()
  })

  it('offers nothing to finish on the page of a link that still holds its token', () => {
    useSession.setState({ status: 'mfa-required', account: null })
    view('/auth/confirm?token_hash=abc123&type=email')

    expect(screen.queryByRole('link', { name: 'Finish signing in' })).toBeNull()
  })

  it('keeps the sign-in reachable while the API cannot be asked who is signed in', () => {
    useSession.setState({ status: 'unavailable', account: null })
    view()

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  it('offers neither the account nor sign-in while the account is being asked for', () => {
    useSession.setState({ status: 'loading', account: null })
    view()

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Account' })).toBeNull()
  })

  it('offers the account and the schedule to a signed-in account', () => {
    useSession.setState({ status: 'ready', account })
    view()

    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account')
    expect(screen.getByRole('link', { name: 'My schedule' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })
})
