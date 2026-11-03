import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { recoverWithCode, signOut, verifyCode } from '../api/auth'
import { MfaPage } from './mfa-page'

vi.mock('../api/auth', () => ({
  verifyCode: vi.fn(),
  recoverWithCode: vi.fn(),
  signOut: vi.fn(),
}))

const account = {
  id: 'a',
  email: 'anna@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
  signInMethods: ['password'],
}

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderAt(search = '', client = new QueryClient()) {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/auth/mfa${search}`]}>
          <Routes>
            <Route path="/auth/mfa" element={<MfaPage />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

/** A right code signs in, as the API call does. */
function answerSignsIn(call: typeof verifyCode, signedIn = account) {
  vi.mocked(call).mockImplementation(() => {
    useSession.setState({ status: 'ready', account: signedIn })
    return Promise.resolve(null)
  })
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'mfa-required', account: null })
  vi.mocked(verifyCode).mockReset().mockResolvedValue(null)
  vi.mocked(recoverWithCode).mockReset().mockResolvedValue(null)
  vi.mocked(signOut).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

describe('MfaPage', () => {
  it('takes the code of the authenticator app as a one-time code a phone offers to fill', () => {
    renderAt()

    const field = screen.getByLabelText('Code')
    expect(field.getAttribute('inputmode')).toBe('numeric')
    expect(field.getAttribute('autocomplete')).toBe('one-time-code')
  })

  it('sends the code and opens the page the sign-in came from', async () => {
    answerSignsIn(verifyCode)
    const user = renderAt('?redirect=%2Fconvention-a%2Fteam')

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(verifyCode).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('at /convention-a/team')).toBeTruthy()
  })

  it('opens the start page when nothing was asked for, and ignores an address on another origin', async () => {
    answerSignsIn(verifyCode)
    const user = renderAt('?redirect=https%3A%2F%2Fevil.test')

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('at /')).toBeTruthy()
  })

  it('shows the translated message for a wrong code and keeps the form', async () => {
    vi.mocked(verifyCode).mockResolvedValue(new ORPCError('mfa.code-invalid', { status: 400 }))
    const user = renderAt('?redirect=%2Fconvention-a%2Fteam')

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect((await screen.findByRole('alert')).textContent).toContain('The code is wrong')
    expect(screen.getByLabelText<HTMLInputElement>('Code').value).toBe('123456')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByText('at /convention-a/team')).toBeNull()
  })

  it('sends nothing for a code that is not six digits', async () => {
    const user = renderAt()

    await user.type(screen.getByLabelText('Code'), '12 4')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(verifyCode).not.toHaveBeenCalled()
    expect(screen.getByText('Enter the six digits from your authenticator app.')).toBeTruthy()
  })

  it('offers a recovery code, sent as typed, and then opens the page', async () => {
    answerSignsIn(recoverWithCode)
    const user = renderAt('?redirect=%2Fconvention-a%2Fteam')

    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    expect(screen.queryByLabelText('Code')).toBeNull()
    await user.type(screen.getByLabelText('Recovery code'), 'abcd efgh-ijkl mnop')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(recoverWithCode).toHaveBeenCalledWith('abcd efgh-ijkl mnop')
    expect(verifyCode).not.toHaveBeenCalled()
    expect(await screen.findByText('at /convention-a/team')).toBeTruthy()
  })

  it('goes back to the code of the app from the recovery code', async () => {
    const user = renderAt()

    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    await user.click(screen.getByRole('button', { name: 'Use the code of the app' }))

    expect(screen.getByLabelText('Code')).toBeTruthy()
  })

  it('forgets the answers cached before the code, so none shows an account without it', () => {
    const client = new QueryClient()
    client.setQueryData(['account', 'me'], { mfaEnabled: true })

    renderAt('', client)

    expect(client.getQueryData(['account', 'me'])).toBeUndefined()
  })

  it('offers no way back to sign-in that the pending session would bounce: sign out is the way', async () => {
    vi.mocked(verifyCode).mockResolvedValue(new ORPCError('session.invalid', { status: 401 }))
    const user = renderAt('?redirect=%2Fconvention-a%2Fteam')

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('link', { name: 'Go to sign-in' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('signs out from the code screen and leads to sign-in', async () => {
    vi.mocked(signOut).mockImplementation(() => {
      useSession.setState({ status: 'ready', account: null })
      return Promise.resolve(null)
    })
    const user = renderAt('?redirect=%2Fconvention-a%2Fteam')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledOnce()
    expect(await screen.findByText('at /login?redirect=%2Fconvention-a%2Fteam')).toBeTruthy()
  })

  it('shows why a sign-out failed and stays on the code screen', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    const user = renderAt()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Try again')
    expect(screen.getByLabelText('Code')).toBeTruthy()
  })

  it('sends nothing for an empty recovery code and says so', async () => {
    const user = renderAt()

    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByLabelText('Recovery code'), '  ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(recoverWithCode).not.toHaveBeenCalled()
    expect(screen.getByText('Enter one of your recovery codes.')).toBeTruthy()
  })

  it('shows nothing of the form while the session is asked for', () => {
    useSession.setState({ status: 'loading', account: null })
    renderAt()

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('sends a session without an account to sign-in', () => {
    useSession.setState({ status: 'ready', account: null })
    renderAt('?redirect=%2Fconvention-a%2Fteam')

    expect(screen.getByText('at /login?redirect=%2Fconvention-a%2Fteam')).toBeTruthy()
  })

  it('sends a signed-in account on at once', () => {
    useSession.setState({ status: 'ready', account })
    renderAt('?redirect=%2Fconvention-a%2Fteam')

    expect(screen.getByText('at /convention-a/team')).toBeTruthy()
  })

  it('follows the session arriving later', () => {
    useSession.setState({ status: 'loading', account: null })
    renderAt()

    act(() => useSession.setState({ status: 'mfa-required', account: null }))

    expect(screen.getByLabelText('Code')).toBeTruthy()
  })
})
