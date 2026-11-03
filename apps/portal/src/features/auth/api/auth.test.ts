import { i18n } from '@lingui/core'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { AUTH_RETURN_STORAGE_KEY } from '../model/auth-return'
import { resendConfirmation, sendPasswordLink, signOut, signUp, verifyLink } from './auth'

const me = {
  id: 'a',
  email: 'ada@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  signInMethods: ['password'],
}

function stubApi(...responses: Response[]) {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) => {
      requests.push(request)
      return Promise.resolve(responses.shift() ?? new Response(null, { status: 202 }))
    }),
  )
  return requests
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'pl', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ status: 'ready', account: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signUp', () => {
  it('sends the names and the address, in the active language, with no password', async () => {
    const requests = stubApi()

    const failure = await signUp(
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      '/schedule',
    )

    expect(failure).toBeNull()
    expect(requests[0]!.method).toBe('POST')
    expect(new URL(requests[0]!.url).pathname).toBe('/auth/sign-up')
    expect(requests[0]!.headers.get('accept-language')).toBe('pl')
    expect(requests[0]!.credentials).toBe('include')
    expect(await requests[0]!.json()).toEqual({
      email: 'ada@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBe('/schedule')
  })

  it('returns the failure and remembers no return', async () => {
    stubApi(json(503, { code: 'server.unavailable' }))

    const failure = await signUp(
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      '/schedule',
    )

    expect(failure).toMatchObject({ code: 'server.unavailable' })
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBeNull()
  })
})

describe('the links of an email', () => {
  it('asks for a new confirmation link and remembers where to return', async () => {
    const requests = stubApi()

    expect(await resendConfirmation('ada@example.test', '/schedule')).toBeNull()

    expect(new URL(requests[0]!.url).pathname).toBe('/auth/resend')
    expect(await requests[0]!.json()).toEqual({ email: 'ada@example.test' })
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBe('/schedule')
  })

  it('asks for a password link and remembers where to return', async () => {
    const requests = stubApi()

    expect(await sendPasswordLink('ada@example.test', '/account')).toBeNull()

    expect(new URL(requests[0]!.url).pathname).toBe('/auth/password/forgot')
    expect(localStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBe('/account')
  })

  it('redeems a link and shows the account it signed in', async () => {
    const requests = stubApi(json(200, me))

    expect(await verifyLink({ tokenHash: 'hash-a', type: 'recovery' })).toBeNull()

    expect(new URL(requests[0]!.url).pathname).toBe('/auth/verify')
    expect(await requests[0]!.json()).toEqual({ tokenHash: 'hash-a', type: 'recovery' })
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
  })
})

describe('signOut', () => {
  it('ends the session shown only when the API ended it', async () => {
    useSession.setState({ status: 'ready', account: me })
    stubApi(new Response(null, { status: 204 }))

    expect(await signOut()).toBeNull()
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
  })

  it('keeps the session shown when the API could not end it', async () => {
    useSession.setState({ status: 'ready', account: me })
    stubApi(json(503, { code: 'server.unavailable' }))

    expect(await signOut()).toMatchObject({ code: 'server.unavailable' })
    expect(useSession.getState().account?.id).toBe('a')
  })
})
