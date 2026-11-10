import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '../../../shared/ui'
import { signOut } from '../../auth'
import { NavUser } from './nav-user'

const state = vi.hoisted(() => ({
  firstName: null as string | null,
  lastName: null as string | null,
}))

vi.mock('../../auth', () => ({ signOut: vi.fn() }))
vi.mock('../api/account', () => ({
  accountOptions: () => ({
    queryKey: ['account', state.firstName, state.lastName],
    queryFn: () =>
      Promise.resolve({
        id: 'a',
        email: 'a@x.test',
        firstName: state.firstName,
        lastName: state.lastName,
        locale: null,
        mfaEnabled: false,
        signInMethods: ['password'],
      }),
  }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.firstName = null
  state.lastName = null
})

afterEach(cleanup)

const renderNav = () =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SidebarProvider>
            <NavUser />
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )

/** Renders the account menu and opens it from its button, which names the signed-in address. */
async function openMenu() {
  renderNav()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'a@x.test' }))
  return user
}

describe('NavUser', () => {
  it('stays closed until its button is pressed', async () => {
    renderNav()

    const trigger = await screen.findByRole('button', { name: 'a@x.test' })
    expect(trigger.getAttribute('aria-expanded')).not.toBe('true')
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
  })

  it('names the account by its name, then its address, when it has one', async () => {
    state.firstName = 'Anna'
    state.lastName = 'Nowak'
    renderNav()

    // The name and the address sit in two lines; whether a space joins them is the browser's.
    expect(await screen.findByRole('button', { name: /^Anna Nowak ?a@x\.test$/ })).toBeTruthy()
  })

  it('leads to the account page', async () => {
    await openMenu()

    const account = await screen.findByRole('menuitem', { name: 'Account' })
    expect(account.getAttribute('href')).toBe('/account')
  })

  it('signs out, and shows nothing when that worked', async () => {
    vi.mocked(signOut).mockResolvedValue(null)
    const user = await openMenu()

    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a failed sign-out, since the session cookies are still set', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    const user = await openMenu()

    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The service is temporarily unavailable. Try again in a moment.',
    )
  })
})
