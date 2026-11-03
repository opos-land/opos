import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../shared/lib/session'
import { Layout } from './layout'

vi.mock('../features/account', () => ({ AccountLocale: () => null }))

const account = { id: 'a', email: 'a@x.test', firstName: null, lastName: null, locale: null }

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
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
