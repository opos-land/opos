import { afterEach, describe, expect, it, vi } from 'vitest'
import { toErrorResponse } from '../../common/filters/http-exception.filter'
import { type Env } from '../../config/env'
import { AuthAdminClient } from './auth-admin.client'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const client = () =>
  new AuthAdminClient({
    AUTH_URL: 'http://auth.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  } as Env)

/** Supabase Auth answers every request with this status and body. */
function answer(status: number, body: unknown = {}) {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthAdminClient.deleteUser', () => {
  it('deletes the user with the service role key', async () => {
    const fetch = answer(200, { id: USER_ID })

    expect(await client().deleteUser(USER_ID)).toBe(true)

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://auth.test/admin/users/${USER_ID}`)
    expect(init.method).toBe('DELETE')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer service-role-key')
  })

  it('answers false for a user already gone', async () => {
    answer(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })

    expect(await client().deleteUser(USER_ID)).toBe(false)
  })

  it.each([
    [401, 'no_authorization'],
    [403, 'bad_jwt'],
    [403, 'not_admin'],
    [500, 'unexpected_failure'],
  ])('turns a %i %s from Supabase Auth into a 500 server.error', async (status, errorCode) => {
    answer(status, { code: status, error_code: errorCode, msg: 'Refused' })

    const failure: unknown = await client()
      .deleteUser(USER_ID)
      .then(
        () => undefined,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).cause).toMatchObject({ status })
    expect(toErrorResponse(failure)).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })
})
