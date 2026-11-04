import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithPassword } from '../../auth'
import {
  disableTwoFactor,
  enableTwoFactor,
  enrollTwoFactor,
  refreshAccount,
} from '../api/two-factor'
import { type SignInMethods } from '../model/sign-in-methods'
import { TwoFactorCard } from './two-factor-card'

vi.mock('../../auth', () => ({
  signInWithPassword: vi.fn(),
  GoogleButton: ({ returnTo }: { returnTo: string }) => (
    <button type="button">google back to {returnTo}</button>
  ),
}))
vi.mock('../api/two-factor', () => ({
  enrollTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  refreshAccount: vi.fn(),
}))

const QR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>'
const SECRET = 'JBSWY3DPEHPK3PXP'
const FACTOR = '4e2d1b5e-0000-4000-8000-000000000001'
const CODES = Array.from({ length: 10 }, (_, index) => `CODEAAAABBBB${String(1000 + index)}`)
const enrolled = { factorId: FACTOR, qrCode: QR, secret: SECRET }

const password = { password: true, google: false }

/** The account page's part: the card follows `mfaEnabled`, which `refreshAccount` changes. */
function Harness({ start, methods }: { start: boolean; methods: SignInMethods }) {
  const [mfaEnabled, setMfaEnabled] = useState(start)
  vi.mocked(refreshAccount).mockImplementation(() => {
    setMfaEnabled(!vi.mocked(disableTwoFactor).mock.calls.length)
    return Promise.resolve()
  })
  return <TwoFactorCard email="anna@example.test" mfaEnabled={mfaEnabled} methods={methods} />
}

let client: QueryClient

function renderCard(start = false, methods: SignInMethods = password) {
  client = new QueryClient()
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/account']}>
          <Harness start={start} methods={methods} />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

async function startEnrolling(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))
  await screen.findByAltText('QR code for your authenticator app')
}

async function enterCode(user: ReturnType<typeof userEvent.setup>, code = '123456') {
  await user.type(screen.getByLabelText('Code from the app'), code)
  await user.click(screen.getByRole('button', { name: 'Turn on' }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(enrollTwoFactor).mockReset().mockResolvedValue(enrolled)
  vi.mocked(enableTwoFactor).mockReset().mockResolvedValue({ recoveryCodes: CODES })
  vi.mocked(disableTwoFactor).mockReset().mockResolvedValue(undefined)
  vi.mocked(refreshAccount).mockReset()
  vi.mocked(signInWithPassword).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

describe('TwoFactorCard', () => {
  it('shows 2FA as off, with the way to turn it on', () => {
    renderCard(false)

    expect(screen.getByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn off two-factor authentication' })).toBeNull()
  })

  it('shows the QR and the secret, then the codes once after a right code', async () => {
    const user = renderCard(false)

    await startEnrolling(user)
    expect(screen.getByAltText('QR code for your authenticator app').getAttribute('src')).toBe(QR)
    expect(screen.getByText(SECRET)).toBeTruthy()
    expect(screen.queryByText(CODES[0]!)).toBeNull()

    await enterCode(user)

    expect(enableTwoFactor).toHaveBeenCalledWith(FACTOR, '123456')
    for (const code of CODES) expect(await screen.findByText(code)).toBeTruthy()
    expect(screen.queryByAltText('QR code for your authenticator app')).toBeNull()
    expect(screen.queryByText(SECRET)).toBeNull()
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(client, true)
  })

  it('the codes view stays until the person confirms they saved them', async () => {
    const user = renderCard(false)
    await startEnrolling(user)
    await enterCode(user)
    await screen.findByText(CODES[0]!)

    // GET /me already says 2FA is on, and the codes are still there.
    expect(screen.getByText(CODES[9]!)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn off two-factor authentication' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'I have saved my codes' }))

    expect(screen.queryByText(CODES[0]!)).toBeNull()
    expect(screen.getByText(/Two-factor authentication is on/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn off two-factor authentication' })).toBeTruthy()
  })

  it('a wrong code shows the translated message and keeps the form', async () => {
    vi.mocked(enableTwoFactor).mockRejectedValue(new ORPCError('mfa.code-invalid', { status: 400 }))
    const user = renderCard(false)
    await startEnrolling(user)

    await enterCode(user)

    expect((await screen.findByRole('alert')).textContent).toContain('The code is wrong')
    expect(screen.getByLabelText<HTMLInputElement>('Code from the app').value).toBe('123456')
    expect(screen.getByAltText('QR code for your authenticator app')).toBeTruthy()
    expect(refreshAccount).not.toHaveBeenCalled()
  })

  it('sends nothing for a code that is not six digits', async () => {
    const user = renderCard(false)
    await startEnrolling(user)

    await enterCode(user, '12')

    expect(enableTwoFactor).not.toHaveBeenCalled()
    expect(screen.getByText('Enter the six digits from your authenticator app.')).toBeTruthy()
  })

  it('drops the secret and the QR when the person cancels', async () => {
    const user = renderCard(false)
    await startEnrolling(user)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(SECRET)).toBeNull()
    expect(screen.queryByAltText('QR code for your authenticator app')).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
  })

  it('keeps neither the secret nor the codes in the mutation cache or in the browser storage', async () => {
    const user = renderCard(false)
    await startEnrolling(user)
    await enterCode(user)
    await screen.findByText(CODES[0]!)
    await user.click(screen.getByRole('button', { name: 'I have saved my codes' }))

    const everything = JSON.stringify([
      client
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state),
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state),
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ])
    expect(everything).not.toContain(SECRET)
    expect(everything).not.toContain(QR)
    expect(everything).not.toContain(CODES[0]!)
    expect(document.body.textContent).not.toContain(CODES[0]!)
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('turns 2FA off and then shows it as off', async () => {
    const user = renderCard(true)

    await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }))

    expect(disableTwoFactor).toHaveBeenCalledOnce()
    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(client, false)
  })

  it('tells how to get new codes when the codes of a turn-on were lost to a racing request', async () => {
    vi.mocked(enableTwoFactor).mockRejectedValue(
      new ORPCError('mfa.already-enabled', { status: 409 }),
    )
    const user = renderCard(false)
    await startEnrolling(user)

    await enterCode(user)

    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('recovery codes could not be shown')
    expect(notice.textContent).toContain('turn two-factor authentication off')
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(client, true)
    expect(screen.queryByAltText('QR code for your authenticator app')).toBeNull()
  })

  it('shows the secret as one message with its label', async () => {
    const user = renderCard(false)

    await startEnrolling(user)

    expect(screen.getByText(SECRET).parentElement?.textContent).toBe(`Secret: ${SECRET}`)
  })

  it('refreshes at once when turning off finds 2FA already off, and shows it as off', async () => {
    vi.mocked(disableTwoFactor).mockRejectedValue(new ORPCError('mfa.not-enabled', { status: 404 }))
    const user = renderCard(true)

    await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }))

    await vi.waitFor(() => expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(client, false))
  })

  describe('when the sign-in is too old', () => {
    const tooOld = () => new ORPCError('session.reauthentication-required', { status: 401 })

    it('asks for the password, then turns 2FA on', async () => {
      vi.mocked(enrollTwoFactor).mockRejectedValueOnce(tooOld())
      const user = renderCard(false)

      await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))
      expect((await screen.findByRole('alert')).textContent).toContain('Confirm it is you')
      await user.type(screen.getByLabelText('Your password'), 'secret password')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'anna@example.test',
        password: 'secret password',
      })
      expect(await screen.findByAltText('QR code for your authenticator app')).toBeTruthy()
      expect(enrollTwoFactor).toHaveBeenCalledTimes(2)
    })

    it('asks for the password, then turns 2FA off', async () => {
      vi.mocked(disableTwoFactor).mockRejectedValueOnce(tooOld())
      const user = renderCard(true)

      await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }))
      await user.type(await screen.findByLabelText('Your password'), 'secret password')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
      expect(disableTwoFactor).toHaveBeenCalledTimes(2)
    })

    it('leaves the code screen to an account with 2FA: the password sign-in asks for a code, no error', async () => {
      vi.mocked(disableTwoFactor).mockRejectedValueOnce(tooOld())
      vi.mocked(signInWithPassword).mockResolvedValue(
        new ORPCError('session.mfa-required', { status: 401 }),
      )
      const user = renderCard(true)

      await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }))
      await user.type(await screen.findByLabelText('Your password'), 'secret password')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      await vi.waitFor(() => expect(signInWithPassword).toHaveBeenCalledOnce())
      // Only the refusal of the too old sign-in is shown, not a failure of the password sign-in.
      expect(screen.getByRole('alert').textContent).toContain('Confirm it is you')
      expect(disableTwoFactor).toHaveBeenCalledOnce()
      expect(refreshAccount).not.toHaveBeenCalled()
    })

    it('lets the person step back from the confirmation to the card', async () => {
      vi.mocked(enrollTwoFactor).mockRejectedValueOnce(tooOld())
      const user = renderCard(false)

      await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))
      await user.click(await screen.findByRole('button', { name: 'Cancel' }))

      expect(screen.queryByLabelText('Your password')).toBeNull()
      expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
    })

    it('does not let the person cancel while the password is being confirmed', async () => {
      vi.mocked(enrollTwoFactor).mockRejectedValueOnce(tooOld())
      vi.mocked(signInWithPassword).mockReturnValue(new Promise(() => undefined))
      const user = renderCard(false)

      await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))
      await user.type(await screen.findByLabelText('Your password'), 'secret password')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      const cancel = await screen.findByRole('button', { name: 'Cancel' })
      expect(cancel.hasAttribute('disabled')).toBe(true)
    })

    it('shows a wrong password and keeps the form', async () => {
      vi.mocked(enrollTwoFactor).mockRejectedValueOnce(tooOld())
      vi.mocked(signInWithPassword).mockResolvedValue(
        new ORPCError('auth.invalid_credentials', { status: 400 }),
      )
      const user = renderCard(false)

      await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))
      await user.type(await screen.findByLabelText('Your password'), 'nope')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password.')
      expect(screen.getByLabelText('Your password')).toBeTruthy()
    })

    it('offers Google, back to this page, to an account that has no password', async () => {
      vi.mocked(enrollTwoFactor).mockRejectedValueOnce(tooOld())
      const user = renderCard(false, { password: false, google: true })

      await user.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))

      const google = await screen.findByRole('button', { name: 'google back to /account' })
      expect(google).toBeTruthy()
      expect(screen.queryByLabelText('Your password')).toBeNull()
      expect(within(document.body).queryByRole('button', { name: 'Confirm' })).toBeNull()
    })
  })
})
