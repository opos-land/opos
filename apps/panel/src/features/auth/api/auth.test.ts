import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { recoverWithCode, verifyCode } from './auth'

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

describe('verifyCode and recoverWithCode', () => {
  it.each([
    ['verifyCode', verifyCode, '/auth/mfa/verify'],
    ['recoverWithCode', recoverWithCode, '/auth/mfa/recover'],
  ])(
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

  it('returns the failure of a wrong code and leaves the session waiting', async () => {
    stubApi(json(400, { code: 'mfa.code-invalid' }))

    const failure = await verifyCode('123456')

    expect(failure).toMatchObject({ code: 'mfa.code-invalid' })
    expect(useSession.getState().status).toBe('mfa-required')
  })
})
