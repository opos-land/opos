import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
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

    await refreshAccount(client)

    expect(client.getQueryData(accountOptions().queryKey)).toEqual(me)
    expect(useSession.getState().account?.mfaEnabled).toBe(true)
  })
})
