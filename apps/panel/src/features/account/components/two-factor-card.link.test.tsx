import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { accountOptions } from '../api/account'
import { signInMethods } from '../model/sign-in-methods'
import { TwoFactorCard } from './two-factor-card'

// The card through the real API link, with only `fetch` stubbed. What an answer does to the card
// is the point here, so no call of the feature is replaced.

const FACTOR = '4e2d1b5e-0000-4000-8000-000000000001'
const enrolled = { factorId: FACTOR, qrCode: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DP' }

const me = (mfaEnabled: boolean) => ({
  id: 'a',
  email: 'anna@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled,
  signInMethods: ['password'],
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const wantsCode = () => json(401, { code: 'session.mfa-required' })

/** Turns 2FA off as the person does: the card's button, then the modal's own. */
async function turnOff(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Turn off two-factor authentication' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Turn off' }),
  )
}

/** Answers by method and path, in order. */
function stubApi(routes: Record<string, Response[]>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`
      calls.push(key)
      const answer = routes[key]?.shift()
      if (!answer) return Promise.reject(new TypeError(`no answer for ${key}`))
      return Promise.resolve(answer)
    }),
  )
  return calls
}

/** The account page's part, which a session waiting for its code unmounts, as `RequireSession`. */
function Page() {
  const waiting = useSession((state) => state.status === 'mfa-required')
  const account = useQuery(accountOptions())
  if (waiting) return <p>waiting for the code</p>
  if (!account.data) return null
  return (
    <TwoFactorCard
      email={account.data.email}
      mfaEnabled={account.data.mfaEnabled}
      methods={signInMethods(account.data.signInMethods)}
    />
  )
}

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/account']}>
          <Page />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  sessionStorage.clear()
  useSession.setState({ status: 'ready', account: me(false) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TwoFactorCard through the API link', () => {
  it('tells of the lost codes after the code screen, though the card was unmounted on the way', async () => {
    stubApi({
      'GET /me': [json(200, me(false)), wantsCode()],
      'POST /auth/mfa/enroll': [json(200, enrolled)],
      'POST /auth/mfa/enable': [json(409, { code: 'mfa.already-enabled' })],
    })
    const user = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Turn on two-factor authentication' }),
    )
    await screen.findByAltText('QR code for your authenticator app')
    await user.type(screen.getByLabelText('Code from the app'), '123456')

    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    // The retry of `enable` set no aal2 cookies, so GET /me wants the code and the card goes.
    await screen.findByText('waiting for the code')
    act(() => useSession.setState({ status: 'ready', account: me(true) }))

    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('recovery codes could not be shown')
    expect(screen.getByRole('button', { name: 'Turn off two-factor authentication' })).toBeTruthy()
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toMatch(/JBSWY3DP|\d{6}/)
  })

  it('stops telling of the lost codes once the person dismisses the notice', async () => {
    sessionStorage.setItem('opos-recovery-codes-lost', '1')
    stubApi({ 'GET /me': [json(200, me(true))] })
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(sessionStorage.getItem('opos-recovery-codes-lost')).toBeNull()
  })

  it('stops telling of the lost codes once two-factor authentication is turned off', async () => {
    sessionStorage.setItem('opos-recovery-codes-lost', '1')
    stubApi({
      'GET /me': [json(200, me(true)), json(200, me(false))],
      'DELETE /auth/mfa': [new Response(null, { status: 204 })],
    })
    const user = renderPage()

    await turnOff(user)

    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(sessionStorage.getItem('opos-recovery-codes-lost')).toBeNull()
  })

  it('does not tell of lost codes beside an account whose 2FA is off', async () => {
    sessionStorage.setItem('opos-recovery-codes-lost', '1')
    stubApi({ 'GET /me': [json(200, me(false))] })
    renderPage()

    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(sessionStorage.getItem('opos-recovery-codes-lost')).toBeNull()
  })

  it('stops telling of the lost codes when turning off finds 2FA already off', async () => {
    sessionStorage.setItem('opos-recovery-codes-lost', '1')
    stubApi({
      'GET /me': [json(200, me(true)), json(200, me(false))],
      'DELETE /auth/mfa': [json(404, { code: 'mfa.not-enabled' })],
    })
    const user = renderPage()

    await turnOff(user)

    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.queryByText(/recovery codes could not be shown/)).toBeNull()
    expect(sessionStorage.getItem('opos-recovery-codes-lost')).toBeNull()
  })

  it('shows 2FA as off once the API turned it off, though the GET /me after it failed', async () => {
    stubApi({
      'GET /me': [json(200, me(true)), json(503, { code: 'server.unavailable' })],
      'DELETE /auth/mfa': [new Response(null, { status: 204 })],
    })
    const user = renderPage()

    await turnOff(user)

    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn off two-factor authentication' })).toBeNull()
  })

  it('shows 2FA as on once the API turned it on, though the GET /me after it failed', async () => {
    stubApi({
      'GET /me': [json(200, me(false)), json(503, { code: 'server.unavailable' })],
      'POST /auth/mfa/enroll': [json(200, enrolled)],
      'POST /auth/mfa/enable': [json(200, { recoveryCodes: ['AAAABBBBCCCCDDDD'] })],
    })
    const user = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Turn on two-factor authentication' }),
    )
    await screen.findByAltText('QR code for your authenticator app')
    await user.type(screen.getByLabelText('Code from the app'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await user.click(await screen.findByRole('button', { name: 'I have saved my codes' }))

    expect(screen.getByRole('button', { name: 'Turn off two-factor authentication' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on two-factor authentication' })).toBeNull()
  })

  it('turning off a 2FA that is already off, in another browser, shows it as off', async () => {
    stubApi({
      'GET /me': [json(200, me(true)), json(200, me(false))],
      'DELETE /auth/mfa': [json(404, { code: 'mfa.not-enabled' })],
    })
    const user = renderPage()

    await turnOff(user)

    expect(await screen.findByText(/Two-factor authentication is off/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn off two-factor authentication' })).toBeNull()
  })
})
