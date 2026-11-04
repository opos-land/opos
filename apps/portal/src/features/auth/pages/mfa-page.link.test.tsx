import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { MfaPage } from './mfa-page'

// The code screen through the real API link, with only `fetch` stubbed: what an answer does to the
// screen is the point here, so no helper of the feature is replaced.

const account = {
  id: 'a',
  email: 'anna@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
  signInMethods: ['password'],
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers by method and path, in order. */
function stubApi(routes: Record<string, (Response | (() => Response))[]>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`
      calls.push(key)
      const answer = routes[key]?.shift()
      if (!answer) return Promise.reject(new TypeError(`no answer for ${key}`))
      return Promise.resolve(typeof answer === 'function' ? answer() : answer)
    }),
  )
  return calls
}

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderAt(search = '') {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
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

async function sendCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Code'), '123456')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'mfa-required', account: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MfaPage through the API link', () => {
  it('a right code followed by a GET /me that fails offers to try again, and the retry goes on', async () => {
    const calls = stubApi({
      'POST /auth/mfa/verify': [new Response(null, { status: 204 })],
      'GET /me': [json(503, { code: 'server.unavailable' }), json(200, account)],
    })
    const user = renderAt('?redirect=%2Fschedule')

    await sendCode(user)
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('at /schedule')).toBeTruthy()
    expect(calls).toEqual(['POST /auth/mfa/verify', 'GET /me', 'GET /me'])
  })

  it('mfa.not-required means the code is not wanted any more: the session is asked for again', async () => {
    const calls = stubApi({
      'POST /auth/mfa/verify': [json(409, { code: 'mfa.not-required' })],
      'GET /me': [json(200, account)],
    })
    const user = renderAt('?redirect=%2Fschedule')

    await sendCode(user)

    expect(await screen.findByText('at /schedule')).toBeTruthy()
    expect(calls).toEqual(['POST /auth/mfa/verify', 'GET /me'])
  })

  it('mfa.not-required for a session that is gone leads to sign-in', async () => {
    stubApi({
      'POST /auth/mfa/verify': [json(409, { code: 'mfa.not-required' })],
      'GET /me': [json(401, { code: 'session.invalid' })],
      'POST /auth/refresh': [json(401, { code: 'session.invalid' })],
    })
    const user = renderAt('?redirect=%2Fschedule')

    await sendCode(user)

    expect(await screen.findByText('at /login?redirect=%2Fschedule')).toBeTruthy()
  })

  it('after a recovery code the account is the one GET /me answers, with two-factor authentication off', async () => {
    const calls = stubApi({
      'POST /auth/mfa/recover': [new Response(null, { status: 204 })],
      'GET /me': [json(200, { ...account, mfaEnabled: false })],
    })
    const user = renderAt()

    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByLabelText('Recovery code'), 'abcdefghijklmnop')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByText('at /account')
    expect(calls).toEqual(['POST /auth/mfa/recover', 'GET /me'])
    expect(useSession.getState().account).toMatchObject({ id: 'a', mfaEnabled: false })
  })

  it('signs out of a pending session and leads to sign-in', async () => {
    const calls = stubApi({ 'POST /auth/sign-out': [new Response(null, { status: 204 })] })
    const user = renderAt('?redirect=%2Fschedule')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('at /login?redirect=%2Fschedule')).toBeTruthy()
    expect(calls).toEqual(['POST /auth/sign-out'])
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
  })

  it('does not offer Sign out while a code is being checked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    const user = renderAt()

    await sendCode(user)

    expect(screen.getByRole('button', { name: 'Sign out' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends no code while the session is being signed out', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    const user = renderAt()

    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true)
    fireEvent.submit(screen.getByLabelText('Code').closest('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
