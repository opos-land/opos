import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { sendPasswordLink, setPassword, verifyLink } from '../api/auth'
import { AUTH_RETURN_STORAGE_KEY, rememberAuthReturn } from '../model/auth-return'
import { ConfirmPage } from './confirm-page'

vi.mock('../api/auth', () => ({
  verifyLink: vi.fn(),
  setPassword: vi.fn(),
  sendPasswordLink: vi.fn(),
}))

const account = {
  id: 'a',
  email: 'invitee@x.test',
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: false,
}

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

/** The address bar of the confirm route, apart from the pages it navigates to. */
function Address() {
  const location = useLocation()
  return <p data-testid="address">{location.pathname + location.search}</p>
}

function renderConfirm(search: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/auth/confirm${search}`]}>
        <Routes>
          <Route
            path="/auth/confirm"
            element={
              <>
                <Address />
                <ConfirmPage />
              </>
            }
          />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

/** A successful verification signs the browser in, as the API call does. */
function verifySignsIn() {
  vi.mocked(verifyLink).mockImplementation(() => {
    useSession.setState({ status: 'ready', account })
    return Promise.resolve(null)
  })
}

async function typePassword(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(screen.getByLabelText(/New password/), password)
  await user.type(screen.getByLabelText('Repeat the password'), password)
  await user.click(screen.getByRole('button', { name: /^Save the password/ }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ status: 'ready', account: null })
  vi.mocked(verifyLink).mockReset().mockResolvedValue(null)
  vi.mocked(setPassword).mockReset().mockResolvedValue(null)
  vi.mocked(sendPasswordLink).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

describe('ConfirmPage with a token', () => {
  it('opening the page sends nothing', () => {
    renderConfirm('?token_hash=hash-a&type=signup')

    expect(verifyLink).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('the button sends tokenHash and type once', async () => {
    const user = userEvent.setup()
    verifySignsIn()
    renderConfirm('?token_hash=hash-a&type=recovery')

    await user.dblClick(screen.getByRole('button', { name: 'Continue' }))

    expect(verifyLink).toHaveBeenCalledOnce()
    expect(verifyLink).toHaveBeenCalledWith({ tokenHash: 'hash-a', type: 'recovery' })
  })

  it('a second press while the first is pending sends nothing', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    vi.mocked(verifyLink).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            useSession.setState({ status: 'ready', account })
            resolve(null)
          }
        }),
    )
    renderConfirm('?token_hash=hash-a&type=recovery')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(verifyLink).toHaveBeenCalledOnce()
    act(() => finish())
    expect(await screen.findByText(/is confirmed/)).toBeTruthy()
  })

  it('drops the spent link from the address, so a reload cannot press it again', async () => {
    const user = userEvent.setup()
    verifySignsIn()
    renderConfirm('?token_hash=hash-a&type=signup')
    expect(screen.getByTestId('address').textContent).toBe(
      '/auth/confirm?token_hash=hash-a&type=signup',
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText(/New password/)

    expect(screen.getByTestId('address').textContent).toBe('/auth/confirm')
  })

  it('after a signup link shows the password form, then opens the page the round trip started on', async () => {
    const user = userEvent.setup()
    verifySignsIn()
    rememberAuthReturn('/invitation')
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Your address invitee@x.test is confirmed/)).toBeTruthy()
    await typePassword(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledWith('correct horse')
    expect(await screen.findByText('at /invitation')).toBeTruthy()
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull()
  })

  it('opens the start page when the round trip left no return', async () => {
    const user = userEvent.setup()
    verifySignsIn()
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText(/New password/)
    await typePassword(user, 'correct horse')

    expect(await screen.findByText('at /')).toBeTruthy()
  })

  it('an account with two-factor authentication shows no error: the code screen follows, and returns here without the spent token', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(new ORPCError('session.mfa-required', { status: 401 }))
    renderConfirm('?token_hash=hash-a&type=recovery')

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(await screen.findByText('at /auth/mfa?redirect=%2Fauth%2Fconfirm')).toBeTruthy()
  })

  it('a browser holding a session that waits for its code still shows the button of an unspent link', () => {
    useSession.setState({ status: 'mfa-required', account: null })
    renderConfirm('?token_hash=hash-a&type=recovery')

    expect(verifyLink).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('a new link is not tied to one browser', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(new ORPCError('auth.otp_expired', { status: 422 }))
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('Email'), 'invitee@x.test')
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'We sent a new link to invitee@x.test.',
    )
  })

  it('otp_expired offers a password link for a signup link, which serves a confirmed address too', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(new ORPCError('auth.otp_expired', { status: 422 }))
    rememberAuthReturn('/invitation')
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The link has expired. Ask for a new one.',
    )
    await user.type(screen.getByLabelText('Email'), 'invitee@x.test')
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))

    expect(sendPasswordLink).toHaveBeenCalledWith('invitee@x.test', '/invitation')
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('says a new link was sent for a recovery link', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(new ORPCError('auth.otp_expired', { status: 422 }))
    renderConfirm('?token_hash=hash-a&type=recovery')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('Email'), 'invitee@x.test')
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'We sent a new link to invitee@x.test.',
    )
  })

  it('otp_expired offers a password link for a recovery link', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(new ORPCError('auth.otp_expired', { status: 422 }))
    renderConfirm('?token_hash=hash-a&type=recovery')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('alert')
    await user.type(screen.getByLabelText('Email'), 'invitee@x.test')
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))

    expect(sendPasswordLink).toHaveBeenCalledWith('invitee@x.test', '/')
  })

  it.each([
    ['auth.over_request_rate_limit', 429, 'Too many attempts. Try again in a few minutes.'],
    ['server.unavailable', 503, 'The service is temporarily unavailable. Try again in a moment.'],
  ])(
    'a refusal by %s is shown above Continue, which stays, with the way to sign-in below',
    async (code, status, text) => {
      const user = userEvent.setup()
      vi.mocked(verifyLink).mockResolvedValue(new ORPCError(code, { status }))
      renderConfirm('?token_hash=hash-a&type=signup')

      await user.click(screen.getByRole('button', { name: 'Continue' }))

      expect((await screen.findByRole('alert')).textContent).toBe(text)
      expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
      expect(screen.queryByLabelText('Email')).toBeNull()
      expect(screen.getByRole('link', { name: 'Go to sign-in' }).getAttribute('href')).toBe(
        '/login',
      )
    },
  )

  it('a network failure leaves Continue to press again, and the second press sends again', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValueOnce(new TypeError('Failed to fetch'))
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('alert')
    vi.mocked(verifyLink).mockImplementation(() => {
      useSession.setState({ status: 'ready', account })
      return Promise.resolve(null)
    })
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(verifyLink).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/is confirmed/)).toBeTruthy()
  })
})

describe('ConfirmPage without a token', () => {
  it.each(['', '?token_hash=hash-a', '?token_hash=hash-a&type=magiclink', '?type=signup'])(
    'a page opened with %j offers the login to a browser without a session',
    (search) => {
      renderConfirm(search)

      expect(screen.getByRole('link', { name: 'Go to sign-in' }).getAttribute('href')).toBe(
        '/login',
      )
      expect(verifyLink).not.toHaveBeenCalled()
      expect(screen.queryByLabelText(/New password/)).toBeNull()
    },
  )

  it('shows the password form to a browser holding a session', async () => {
    const user = userEvent.setup()
    useSession.setState({ status: 'ready', account })
    renderConfirm('')

    expect(screen.getByText(/Your address invitee@x.test is confirmed/)).toBeTruthy()
    await typePassword(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledWith('correct horse')
    expect(verifyLink).not.toHaveBeenCalled()
    expect(await screen.findByText('at /')).toBeTruthy()
  })

  it('offers to try again, rather than the sign-in, when the account could not be asked for', () => {
    useSession.setState({ status: 'unavailable', account: null })
    renderConfirm('')

    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Go to sign-in' })).toBeNull()
  })

  it('waits for the session to be known', () => {
    useSession.setState({ status: 'loading', account: null })
    renderConfirm('')

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })
})
