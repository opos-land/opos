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
import { DeleteAccount } from './delete-account'

const deleteMe = vi.fn()

vi.mock('../../auth', () => ({
  signInWithPassword: vi.fn(),
  GoogleButton: ({ returnTo }: { returnTo: string }) => <p>google back to {returnTo}</p>,
}))
vi.mock('../api/account', () => ({
  deleteAccountOptions: () => ({ mutationFn: () => deleteMe() as Promise<void> }),
  forgetSession: vi.fn(() => Promise.resolve()),
}))

function Home() {
  const location = useLocation()
  return <p>home {JSON.stringify(location.state)}</p>
}

function renderAt(path: string, methods = { password: true, google: false }) {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/account"
              element={<DeleteAccount email="anna@example.test" methods={methods} />}
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
    expect(screen.getByText('google back to /account?confirm=deletion')).toBeTruthy()
    expect(screen.queryByLabelText('Your password')).toBeNull()
    cleanup()

    const after = renderAt('/account?confirm=deletion', methods)
    await after.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText('home {"accountDeleted":true}')).toBeTruthy()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})
