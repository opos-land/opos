import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signOut } from '../../auth'
import { AccountMenu } from './account-menu'

vi.mock('../../auth', () => ({ signOut: vi.fn() }))
vi.mock('../api/account', () => ({
  mergeSavedAccount: vi.fn(),
  accountOptions: () => ({
    queryKey: ['account'],
    queryFn: () =>
      Promise.resolve({
        id: 'a',
        email: 'a@x.test',
        locale: null,
        mfaEnabled: false,
        signInMethods: ['password'],
      }),
  }),
  updateAccountOptions: () => ({ mutationFn: () => Promise.resolve({}) }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

function renderMenu() {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AccountMenu />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

describe('AccountMenu sign-out', () => {
  it('shows a failed sign-out, since the session cookies are still set', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    renderMenu()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The service is temporarily unavailable. Try again in a moment.',
    )
  })

  it('shows nothing when the sign-out worked', async () => {
    vi.mocked(signOut).mockResolvedValue(null)
    renderMenu()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AccountMenu two-factor authentication', () => {
  it('holds the two-factor card, off for an account without it', async () => {
    renderMenu()

    expect(
      await screen.findByRole('button', { name: 'Turn on two-factor authentication' }),
    ).toBeTruthy()
  })
})
