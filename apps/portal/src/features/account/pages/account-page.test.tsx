import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut } from '../../auth'
import { AccountPage } from './account-page'

const me = vi.hoisted(() => ({
  current: {
    id: 'user-anna',
    email: 'anna@example.test',
    firstName: null,
    lastName: null,
    locale: null,
    mfaEnabled: false,
    signInMethods: ['password'] as string[],
  },
}))

vi.mock('../../auth', () => ({
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  GoogleButton: () => <button type="button">Confirm with Google</button>,
}))
vi.mock('../api/account', () => ({
  accountKey: () => ['account'],
  accountOptions: () => ({ queryKey: ['account'], queryFn: () => Promise.resolve(me.current) }),
  updateAccountOptions: () => ({ mutationFn: () => Promise.resolve(me.current) }),
  deleteAccountOptions: () => ({ mutationFn: () => Promise.resolve() }),
  forgetSession: vi.fn(),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  me.current = { ...me.current, mfaEnabled: false, signInMethods: ['password'] }
  vi.mocked(signOut).mockReset()
})

afterEach(cleanup)

async function openPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/account']}>
          <AccountPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  await screen.findByText('Signed in as anna@example.test')
  return userEvent.setup()
}

describe('AccountPage sign-out', () => {
  it('shows a failed sign-out, since the session cookies are still set', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The service is temporarily unavailable. Try again in a moment.',
    )
  })

  it('shows nothing when the sign-out worked', async () => {
    vi.mocked(signOut).mockResolvedValue(null)
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says it ends the session on this device only', async () => {
    await openPage()

    expect(screen.getByText('Signing out ends your session on this device.')).toBeTruthy()
  })
})

describe('AccountPage two-factor authentication', () => {
  it('shows the card off for an account without it', async () => {
    await openPage()

    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
  })

  it('shows the card on for an account with it, as GET /me says', async () => {
    me.current = { ...me.current, mfaEnabled: true }
    await openPage()

    expect(screen.getByRole('button', { name: 'Turn off two-factor authentication' })).toBeTruthy()
  })
})

describe('AccountPage deletion', () => {
  it('confirms an email account with the password alone', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.getByLabelText('Your password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm with Google' })).toBeNull()
  })

  it('offers the methods GET /me names: Google alone for a Google account', async () => {
    me.current = { ...me.current, signInMethods: ['google'] }
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.queryByLabelText('Your password')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm with Google' })).toBeTruthy()
  })
})
