import { i18n, type MessageDescriptor } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifySuccess } from '../../../shared/lib/notify'
import { mfaReturnFor, signInWithPassword } from '../../auth'
import { forgetSession } from '../api/account'
import {
  rememberDeletionConfirmation,
  startedDeletionConfirmation,
} from '../model/deletion-confirmation'
import { DeleteAccount } from './delete-account'

const deleteMe = vi.fn()

vi.mock('../../../shared/lib/notify', () => ({ notifySuccess: vi.fn(), notifyFailure: vi.fn() }))

vi.mock(import('../../auth'), async (importOriginal) => ({
  ...(await importOriginal()),
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
  vi.mocked(notifySuccess).mockClear()
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
    expect(await screen.findByText('home null')).toBeTruthy()
    expect(forgetSession).toHaveBeenCalledOnce()
    // Told once the session is gone: an account change closes the notifications of the account.
    const [meta] = vi.mocked(notifySuccess).mock.calls[0] ?? []
    expect(i18n._(meta?.success as MessageDescriptor)).toBe('Your account has been deleted.')
    expect(vi.mocked(forgetSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(notifySuccess).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('on an account with two-factor authentication the password leads through the code and back to the deletion', async () => {
    let returnTo = ''
    vi.mocked(signInWithPassword).mockImplementation(() => {
      returnTo = mfaReturnFor({ pathname: '/account', search: '' })
      return Promise.resolve(new ORPCError('session.mfa-required', { status: 401 }))
    })
    const user = renderAt('/account')

    await confirmWithPassword(user)

    // The code screen returns to /account?confirm=deletion, which offers the deletion to this account.
    expect(returnTo).toBe('/account?confirm=deletion')
    expect(startedDeletionConfirmation()).toBe('user-anna')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(deleteMe).not.toHaveBeenCalled()
    expect(mfaReturnFor({ pathname: '/account', search: '' })).toBe('/account')
  })

  it('after the code, the return deletes with one press and says the person confirmed again', async () => {
    rememberDeletionConfirmation('user-anna')
    deleteMe.mockResolvedValue(undefined)
    const user = renderAt('/account?confirm=deletion', bothMethods)

    expect(screen.getByText(/You confirmed it is you again/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText('home null')).toBeTruthy()
  })

  it('deletes nothing when the password is wrong', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue(
      new ORPCError('auth.invalid_credentials', { status: 400 }),
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

    expect(await screen.findByText('home null')).toBeTruthy()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('deletes nothing when Google comes back signed in to another account', () => {
    rememberDeletionConfirmation('user-anna')
    renderAt('/account?confirm=deletion', bothMethods, 'user-bruno')

    expect(screen.getByRole('alert').textContent).toContain(
      'Google signed you in to a different account, anna@example.test, so nothing was deleted.',
    )
    expect(screen.queryByText(/You confirmed it is you again/)).toBeNull()
    expect(deleteMe).not.toHaveBeenCalled()
  })

  it('spends a confirmation that came back without its parameter, as after a failed Google sign-in', async () => {
    rememberDeletionConfirmation('user-anna')
    renderAt('/account', bothMethods)

    expect(startedDeletionConfirmation()).toBeNull()
    cleanup()

    const user = renderAt('/account?confirm=deletion', bothMethods)
    expect(await screen.findByText('search ""')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.queryByText(/You confirmed it is you again/)).toBeNull()
    expect(screen.getByLabelText('Your password')).toBeTruthy()
  })

  it('offers no deletion to a confirmation link that was not started here', async () => {
    const user = renderAt('/account?confirm=deletion', bothMethods)

    expect(await screen.findByText('search ""')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.queryByText(/You confirmed it is you again/)).toBeNull()
    expect(screen.getByLabelText('Your password')).toBeTruthy()
  })

  it('asks to confirm again once the Google sign-in is too old', async () => {
    rememberDeletionConfirmation('user-anna')
    deleteMe.mockRejectedValue(new ORPCError('session.reauthentication-required', { status: 401 }))
    const user = renderAt('/account?confirm=deletion', bothMethods)

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    // The refusal itself is a notification (query-client.ts); the card asks again.
    expect(await screen.findByLabelText('Your password')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('google back to /account?confirm=deletion')).toBeTruthy()
    expect(forgetSession).not.toHaveBeenCalled()
  })
})
