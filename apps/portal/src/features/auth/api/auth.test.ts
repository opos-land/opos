import { i18n } from '@lingui/core'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { AUTH_RETURN_STORAGE_KEY } from '../model/auth-return'
import {
  recoverWithCode,
  resendConfirmation,
  sendPasswordLink,
  signOut,
  signUp,
  verifyCode,
  verifyLink,
} from './auth'

const me = {
  id: 'a',
  email: 'ada@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: false,
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

describe('verifyCode and recoverWithCode', () => {
  it.each([
    ['verifyCode', verifyCode, '/auth/mfa/verify'],
    ['recoverWithCode', recoverWithCode, '/auth/mfa/recover'],
  ])(
    '%s sends the code, then asks who is signed in and shows the account',
    async (_n, call, path) => {
      const requests = stubApi(new Response(null, { status: 204 }), json(200, me))
      useSession.setState({ status: 'mfa-required', account: null })

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(
        requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
      ).toEqual([`POST ${path}`, 'GET /me'])
      expect(await requests[0]!.json()).toEqual({ code: '123456' })
      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
    },
  )

  it.each([
    ['verifyCode', verifyCode],
    ['recoverWithCode', recoverWithCode],
  ])(
    '%s: a right code followed by a GET /me that fails ends unavailable, which can be retried',
    async (_n, call) => {
      stubApi(new Response(null, { status: 204 }), json(503, { code: 'server.unavailable' }))
      useSession.setState({ status: 'mfa-required', account: null })

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null })
    },
  )

  it.each([
    ['verifyCode', verifyCode],
    ['recoverWithCode', recoverWithCode],
  ])(
    '%s: a GET /me whose session is gone keeps the signed-out state, not unavailable',
    async (_n, call) => {
      stubApi(
        new Response(null, { status: 204 }),
        json(401, { code: 'session.invalid' }),
        json(401, { code: 'session.invalid' }),
      )
      useSession.setState({ status: 'mfa-required', account: null })

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
    },
  )

  it.each([
    ['verifyCode', verifyCode],
    ['recoverWithCode', recoverWithCode],
  ])(
    '%s: a GET /me answered session.invalid while the refresh is unavailable ends unavailable',
    async (_n, call) => {
      stubApi(
        new Response(null, { status: 204 }),
        json(401, { code: 'session.invalid' }),
        json(503, { code: 'server.unavailable' }),
      )
      useSession.setState({ status: 'mfa-required', account: null })

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null })
    },
  )

  it('returns the failure of a wrong code and leaves the session waiting', async () => {
    stubApi(json(400, { code: 'mfa.code-invalid' }))
    useSession.setState({ status: 'mfa-required', account: null })

    const failure = await verifyCode('123456')

    expect(failure).toMatchObject({ code: 'mfa.code-invalid' })
    expect(useSession.getState().status).toBe('mfa-required')
  })
})
