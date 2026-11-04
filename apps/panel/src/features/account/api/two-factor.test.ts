import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { clearSession, mfaRequired } from '../../../shared/lib/session-store'
import { disableTwoFactor, enableTwoFactor, enrollTwoFactor, refreshAccount } from './two-factor'
import { accountOptions } from './account'

const me = {
  id: 'a',
  email: 'ada@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: true,
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
      return Promise.resolve(responses.shift() ?? new Response(null, { status: 204 }))
    }),
  )
  return requests
}

const call = (request: Request) => `${request.method} ${new URL(request.url).pathname}`

beforeEach(() => {
  useSession.setState({ status: 'ready', account: { ...me, mfaEnabled: false } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the calls of the two-factor card', () => {
  it('enrol, enable and disable go to the API', async () => {
    const factorId = '4e2d1b5e-0000-4000-8000-000000000001'
    const requests = stubApi(
      json(200, { factorId, qrCode: 'data:image/svg+xml;utf8,<svg/>', secret: 'ABC' }),
      json(200, { recoveryCodes: Array.from({ length: 10 }, (_, index) => `code-${index}`) }),
      new Response(null, { status: 204 }),
    )

    await enrollTwoFactor()
    await enableTwoFactor(factorId, '123456')
    await disableTwoFactor()

    expect(requests.map(call)).toEqual([
      'POST /auth/mfa/enroll',
      'POST /auth/mfa/enable',
      'DELETE /auth/mfa',
    ])
    expect(await requests[1]!.json()).toEqual({ factorId, code: '123456' })
  })
})

describe('refreshAccount', () => {
  it('puts what GET /me says in the page and in the session, so the card and the account agree', async () => {
    stubApi(json(200, me))
    const client = new QueryClient()

    await refreshAccount(client, true)

    expect(client.getQueryData(accountOptions().queryKey)).toEqual(me)
    expect(useSession.getState().account?.mfaEnabled).toBe(true)
  })

  it('writes what the API just confirmed before it asks, so a GET /me that fails leaves the right state', async () => {
    stubApi(json(503, { code: 'server.unavailable' }))
    const client = new QueryClient()
    client.setQueryData(accountOptions().queryKey, {
      ...me,
      mfaEnabled: false,
      signInMethods: ['password'],
    })

    await expect(refreshAccount(client, true)).rejects.toMatchObject({
      code: 'server.unavailable',
    })

    expect(client.getQueryData(accountOptions().queryKey)).toMatchObject({ mfaEnabled: true })
    expect(useSession.getState().account?.mfaEnabled).toBe(true)
  })

  it('invents no account where none is cached', async () => {
    stubApi(json(503, { code: 'server.unavailable' }))
    const client = new QueryClient()
    useSession.setState({ status: 'ready', account: null })

    await expect(refreshAccount(client, true)).rejects.toBeDefined()

    expect(client.getQueryData(accountOptions().queryKey)).toBeUndefined()
    expect(useSession.getState().account).toBeNull()
  })

  it('writes no account once the session waits for its code meanwhile', async () => {
    let answer!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    )
    const client = new QueryClient()

    const refreshing = refreshAccount(client, true)
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    mfaRequired()
    answer(json(200, me))
    await refreshing

    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
    expect(client.getQueryData(accountOptions().queryKey)).toBeUndefined()
  })

  describe('while GET /me is on its way', () => {
    /** Runs a refresh up to its `GET /me`, then `change`, then lets the answer for `me` arrive. */
    async function refreshAcross(client: QueryClient, change: () => void) {
      let answer!: (response: Response) => void
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
      )
      const refreshing = refreshAccount(client, true)
      await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
      change()
      answer(json(200, me))
      await refreshing
    }

    it('shows no account once the person has signed out', async () => {
      const client = new QueryClient()

      await refreshAcross(client, () => {
        clearSession()
      })

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
      expect(client.getQueryData(accountOptions().queryKey)).toBeUndefined()
    })

    it('leaves the account the tab has settled on when it is another one', async () => {
      const client = new QueryClient()
      const other = { ...me, id: 'b', email: 'other@example.test' }

      await refreshAcross(client, () => {
        useSession.setState({ status: 'ready', account: other })
      })

      expect(useSession.getState().account).toEqual(other)
      expect(client.getQueryData(accountOptions().queryKey)).toBeUndefined()
    })
  })
})
