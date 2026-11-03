import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { LandingPage } from './landing-page'

const account = { id: 'a', email: 'a@x.test', firstName: null, lastName: null, locale: null }

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <LandingPage />
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

describe('LandingPage', () => {
  it('offers registration and sign-in to a visitor without a session', () => {
    view()

    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
  })

  it('shows its content and keeps registration and sign-in when the API cannot be asked', () => {
    useSession.setState({ status: 'unavailable', account: null })
    view()

    expect(screen.getByRole('heading', { name: 'Fantasy conventions, in one place' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leads a signed-in account to its account', () => {
    useSession.setState({ status: 'ready', account })
    view()

    expect(screen.getByRole('link', { name: 'Go to your account' }).getAttribute('href')).toBe(
      '/account',
    )
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('waits for the answer before offering either', () => {
    useSession.setState({ status: 'loading', account: null })
    view()

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Go to your account' })).toBeNull()
  })
})
