import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithPassword } from '../../auth'
import { forgetSession } from '../api/account'
import { rememberDeletionConfirmation } from '../model/deletion-confirmation'
import { DeleteAccount } from './delete-account'

const deleteMe = vi.fn()

vi.mock('../../auth', () => ({
  signInWithPassword: vi.fn(),
  GoogleButton: ({ returnTo, onLeave }: { returnTo: string; onLeave?: () => void }) => (
    <button type="button" onClick={onLeave}>
      google back to {returnTo}
    </button>
  ),
}))
vi.mock('../api/account', () => ({
  deleteAccountOptions: () => ({ mutationFn: () => deleteMe() as Promise<void> }),
  forgetSession: vi.fn(() => Promise.resolve()),
}))

function Home() {
  const location = useLocation()
  return <p>home {JSON.stringify(location.state)}</p>
}

function Search() {
  return <p>search {JSON.stringify(useLocation().search)}</p>
}

const bothMethods = { password: true, google: true }

function renderAt(path: string, methods = { password: true, google: false }, userId = 'user-anna') {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/account"
              element={
                <>
                  <DeleteAccount userId={userId} email="anna@example.test" methods={methods} />
                  <Search />
                </>
              }
            />
            <Route path="/" element={<Home />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

async function confirmWithPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
  await user.type(screen.getByLabelText('Your password'), 'secret password')
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  window.localStorage.clear()
  deleteMe.mockReset()
  vi.mocked(signInWithPassword).mockReset()
  vi.mocked(forgetSession).mockClear()
})

afterEach(cleanup)

describe('DeleteAccount', () => {
  it('signs in with the password again, deletes the account and leaves for the home page', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(null)
    deleteMe.mockResolvedValue(undefined)
    const user = renderAt('/account')

    await confirmWithPassword(user)

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.test',
      password: 'secret password',
    })
    expect(await screen.findByText('home {"accountDeleted":true}')).toBeTruthy()
    expect(forgetSession).toHaveBeenCalledOnce()
  })

  it('deletes nothing when the password is wrong', async () => {
    const { AuthApiError } = await import('@supabase/auth-js')
    vi.mocked(signInWithPassword).mockResolvedValue(
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    )
    const user = renderAt('/account')

    await confirmWithPassword(user)

    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.')
    expect(deleteMe).not.toHaveBeenCalled()
  })

  it('explains what the last head organizer of a convention does first', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(null)
    deleteMe.mockRejectedValue(new ORPCError('membership.last-head', { status: 409 }))
    const user = renderAt('/account')

    await confirmWithPassword(user)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'You are the last head organizer of a convention',
    )
    expect(forgetSession).not.toHaveBeenCalled()
  })

  it('confirms with Google and comes back to delete', async () => {
    deleteMe.mockResolvedValue(undefined)
    const methods = { password: false, google: true }

    const before = renderAt('/account', methods)
    await before.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(screen.queryByLabelText('Your password')).toBeNull()
    await before.click(screen.getByText('google back to /account?confirm=deletion'))
    cleanup()

    const after = renderAt('/account?confirm=deletion', methods)
    expect(await screen.findByText('search ""')).toBeTruthy()
    await after.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText('home {"accountDeleted":true}')).toBeTruthy()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('deletes nothing when Google comes back signed in to another account', () => {
    rememberDeletionConfirmation('user-anna')
    renderAt('/account?confirm=deletion', bothMethods, 'user-bruno')

    expect(screen.getByRole('alert').textContent).toContain(
      'Google signed you in to a different account, anna@example.test, so nothing was deleted.',
    )
    expect(screen.queryByText(/You signed in with Google again/)).toBeNull()
    expect(deleteMe).not.toHaveBeenCalled()
  })

  it('offers no deletion to a confirmation link that was not started here', async () => {
    const user = renderAt('/account?confirm=deletion', bothMethods)

    expect(await screen.findByText('search ""')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.queryByText(/You signed in with Google again/)).toBeNull()
    expect(screen.getByLabelText('Your password')).toBeTruthy()
  })

  it('asks to confirm again once the Google sign-in is too old', async () => {
    rememberDeletionConfirmation('user-anna')
    deleteMe.mockRejectedValue(new ORPCError('session.reauthentication-required', { status: 401 }))
    const user = renderAt('/account?confirm=deletion', bothMethods)

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Confirm it is you: enter your password again or sign in with Google again.',
    )
    expect(screen.getByLabelText('Your password')).toBeTruthy()
    expect(screen.getByText('google back to /account?confirm=deletion')).toBeTruthy()
    expect(forgetSession).not.toHaveBeenCalled()
  })
})
