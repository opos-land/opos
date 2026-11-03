import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { resendConfirmation, sendPasswordLink, setPassword, verifyLink } from '../api/auth'
import { AUTH_RETURN_STORAGE_KEY, rememberAuthReturn } from '../model/auth-return'
import { ConfirmPage } from './confirm-page'

vi.mock('../api/auth', () => ({
  verifyLink: vi.fn(),
  setPassword: vi.fn(),
  resendConfirmation: vi.fn(),
  sendPasswordLink: vi.fn(),
}))

const account = { id: 'a', email: 'invitee@x.test', firstName: null, lastName: null, locale: null }

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderConfirm(search: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/auth/confirm${search}`]}>
        <Routes>
          <Route path="/auth/confirm" element={<ConfirmPage />} />
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
  await user.click(screen.getByRole('button', { name: 'Save the password and join the team' }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ status: 'ready', account: null })
  vi.mocked(verifyLink).mockReset().mockResolvedValue(null)
  vi.mocked(setPassword).mockReset().mockResolvedValue(null)
  vi.mocked(resendConfirmation).mockReset().mockResolvedValue(null)
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

  it('otp_expired offers a new link, a confirmation for a signup link', async () => {
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

    expect(resendConfirmation).toHaveBeenCalledWith('invitee@x.test', '/invitation')
    expect(sendPasswordLink).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toBeTruthy()
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
    expect(resendConfirmation).not.toHaveBeenCalled()
  })

  it('any other refusal is shown by its code, with the way back to sign-in', async () => {
    const user = userEvent.setup()
    vi.mocked(verifyLink).mockResolvedValue(
      new ORPCError('auth.over_request_rate_limit', { status: 429 }),
    )
    renderConfirm('?token_hash=hash-a&type=signup')

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Try again in a few minutes.',
    )
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to sign-in' }).getAttribute('href')).toBe('/login')
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

  it('waits for the session to be known', () => {
    useSession.setState({ status: 'loading', account: null })
    renderConfirm('')

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })
})
