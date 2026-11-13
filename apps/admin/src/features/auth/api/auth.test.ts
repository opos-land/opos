import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { signInWithPassword, signOut, verifyCode } from './auth'

const me = {
  id: 'a',
  email: 'ada@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
  signInMethods: ['password'],
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

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

beforeEach(() => {
  useSession.setState({ status: 'mfa-required', account: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verifyCode', () => {
  it.each([['verifyCode', verifyCode, '/auth/mfa/verify']] as const)(
    '%s sends the code, then asks who is signed in and shows the account',
    async (_name, call, path) => {
      const requests = stubApi(new Response(null, { status: 204 }), json(200, me))

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(
        requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
      ).toEqual([`POST ${path}`, 'GET /me'])
      expect(await requests[0]!.json()).toEqual({ code: '123456' })
      expect(requests[0]!.credentials).toBe('include')
      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
    },
  )

  it.each([['verifyCode', verifyCode]] as const)(
    '%s: a right code followed by a GET /me that fails ends unavailable, which can be retried',
    async (_n, call) => {
      stubApi(new Response(null, { status: 204 }), json(503, { code: 'server.unavailable' }))
      useSession.setState({ status: 'mfa-required', account: null })

      const failure = await call('123456')

      expect(failure).toBeNull()
      expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null })
    },
  )

  it.each([['verifyCode', verifyCode]] as const)(
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

  it.each([['verifyCode', verifyCode]] as const)(
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

    const failure = await verifyCode('123456')

    expect(failure).toMatchObject({ code: 'mfa.code-invalid' })
    expect(useSession.getState().status).toBe('mfa-required')
  })
})

// The admin application signs in by email, password and the code alone, and calls nothing else of
// the API's `auth` routes: the API refuses the rest to its origin.
describe('signInWithPassword', () => {
  it('signs in and shows the account', async () => {
    const requests = stubApi(json(200, me))
    useSession.setState({ status: 'ready', account: null })

    expect(await signInWithPassword({ email: 'ada@example.test', password: 'secret' })).toBeNull()

    expect(new URL(requests[0]!.url).pathname).toBe('/auth/sign-in')
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
  })

  it('returns the refusal that wants the code, which the sign-in form leads on from', async () => {
    stubApi(json(401, { code: 'session.mfa-required' }))
    useSession.setState({ status: 'ready', account: null })

    const failure = await signInWithPassword({ email: 'ada@example.test', password: 'secret' })

    expect(failure).toMatchObject({ code: 'session.mfa-required' })
    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
  })
})

describe('signOut', () => {
  it('ends the session and shows no account', async () => {
    const requests = stubApi(new Response(null, { status: 204 }))
    useSession.setState({ status: 'ready', account: { ...me, theme: null } })

    expect(await signOut()).toBeNull()

    expect(new URL(requests[0]!.url).pathname).toBe('/auth/sign-out')
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
  })
})

describe('the calls of the feature', () => {
  it('are sign-in, the code and sign-out, and no other', async () => {
    expect(Object.keys(await import('./auth')).sort()).toEqual([
      'signInWithPassword',
      'signOut',
      'verifyCode',
    ])
  })
})
