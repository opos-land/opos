import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toErrorResponse } from '../../common/filters/http-exception.filter'
import { type Env } from '../../config/env'
import { AuthAdminClient } from './auth-admin.client'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const client = () =>
  new AuthAdminClient({
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('AuthAdminClient.deleteUser', () => {
  it('deletes the user through the gateway, on the secret key alone', async () => {
    const fetch = answer(200, { id: USER_ID })

    expect(await client().deleteUser(USER_ID)).toBe(true)

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://supabase.test/auth/v1/admin/users/${USER_ID}`)
    expect(init.method).toBe('DELETE')
    const headers = new Headers(init.headers)
    expect(headers.get('apikey')).toBe('sb_secret_test')
    expect(headers.get('authorization')).toBeNull()
  })

  it('answers false for a user already gone', async () => {
    answer(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })

    expect(await client().deleteUser(USER_ID)).toBe(false)
  })

  it.each([
    [400, 'validation_failed'],
    [401, 'no_authorization'],
    [403, 'bad_jwt'],
    [403, 'not_admin'],
    [422, 'unexpected_failure'],
  ])('turns a %i %s from Supabase Auth into a 500 server.error', async (status, errorCode) => {
    answer(status, { code: status, error_code: errorCode, msg: 'Refused' })

    const failure = await failureOf(client().deleteUser(USER_ID))

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).cause).toMatchObject({ status })
    expect(toErrorResponse(failure)).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })

  const expectUnavailable = (failure: unknown) => {
    expect(toErrorResponse(failure)).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
      headers: { 'Retry-After': '30' },
    })
  }

  it.each([500, 502, 503, 504, 505])('turns a %i into a 503 server.unavailable', async (status) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    answer(status, { code: status, msg: 'Down' })

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
  })

  it('turns a 5xx that is not JSON into a 503 server.unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 }))),
    )

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
  })

  it('turns a transport failure into a 503 server.unavailable and logs its cause', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    )

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fetch failed'))
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('sb_secret_test'))
  })

  it('turns a timeout into a 503 server.unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('The operation timed out', 'TimeoutError'))),
    )

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
  })
})
