import { Logger } from '@nestjs/common'
import { DEFAULT_LOCALE } from '@opos/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toErrorResponse } from '../../common/filters/http-exception.filter'
import { AuthAdminClient } from './auth-admin.client'
import { SupabaseAuthFactory } from './supabase-auth.factory'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const client = () =>
  new AuthAdminClient(
    new SupabaseAuthFactory({
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    }),
  )

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

describe('AuthAdminClient.setPassword', () => {
  it('sends the password to the user, on the secret key alone', async () => {
    const fetch = answer(200, { id: USER_ID })

    await client().setPassword(USER_ID, 'a-fresh-random-password')

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://supabase.test/auth/v1/admin/users/${USER_ID}`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ password: 'a-fresh-random-password' })
    expect(new Headers(init.headers).get('authorization')).toBeNull()
  })

  it.each([
    [500, 'Supabase Auth is unavailable'],
    [401, 'Supabase Auth refused updateUserById with 401'],
  ])('refuses on a %s, naming neither the user nor the password', async (status, message) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    answer(status, { msg: 'refused' })

    const failure = await failureOf(client().setPassword(USER_ID, 'a-fresh-random-password'))

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(message)
  })
})

describe('AuthAdminClient.noticeLocale', () => {
  it('takes the locale the account chose, and asks Supabase Auth nothing', async () => {
    const fetch = answer(200, {})

    expect(await client().noticeLocale({ id: USER_ID, locale: 'en' })).toBe('en')

    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['no choice', null],
    ['a locale the platform does not speak', 'cs'],
  ])('with %s reads the locale of the sign-up', async (_, locale) => {
    const fetch = answer(200, { id: USER_ID, user_metadata: { locale: 'en' } })

    expect(await client().noticeLocale({ id: USER_ID, locale })).toBe('en')

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://supabase.test/auth/v1/admin/users/${USER_ID}`)
    expect(init.method).toBe('GET')
  })

  it.each([
    ['no sign-up locale', { id: USER_ID, user_metadata: {} }],
    ['an unsupported one', { id: USER_ID, user_metadata: { locale: 'cs' } }],
  ])('ends at the default with %s', async (_, user) => {
    answer(200, user)

    expect(await client().noticeLocale({ id: USER_ID, locale: null })).toBe(DEFAULT_LOCALE)
  })

  it.each([404, 500, 401])('ends at the default on a %s, logging no id', async (status) => {
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    answer(status, { msg: `no user ${USER_ID}` })

    expect(await client().noticeLocale({ id: USER_ID, locale: null })).toBe(DEFAULT_LOCALE)

    expect(warned).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warned.mock.calls)).not.toContain(USER_ID)
  })
})

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

  it('logs the cause of a transport failure, which auth-js drops', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })),
      ),
    )

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
  })

  it.each([505, 507, 508])(
    'turns a %i that is not JSON into a 503 and logs its status',
    async (status) => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('<html>nope</html>', { status }))),
      )

      expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(status)))
    },
  )

  it('turns a timeout into a 503 server.unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('The operation timed out', 'TimeoutError'))),
    )

    expectUnavailable(await failureOf(client().deleteUser(USER_ID)))
  })
})

const FACTOR_ID = '00000000-0000-4000-8000-000000000002'

describe('AuthAdminClient.deleteFactor', () => {
  it('deletes the factor of the user through the gateway, on the secret key alone', async () => {
    const fetch = answer(200, { id: FACTOR_ID })

    expect(await client().deleteFactor(USER_ID, FACTOR_ID)).toBe(true)

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://supabase.test/auth/v1/admin/users/${USER_ID}/factors/${FACTOR_ID}`)
    expect(init.method).toBe('DELETE')
    const headers = new Headers(init.headers)
    expect(headers.get('apikey')).toBe('sb_secret_test')
    expect(headers.get('authorization')).toBeNull()
  })

  it('answers false for a factor already gone', async () => {
    answer(404, { code: 404, error_code: 'mfa_factor_not_found', msg: 'Factor not found' })

    expect(await client().deleteFactor(USER_ID, FACTOR_ID)).toBe(false)
  })

  it.each([
    [401, 'no_authorization'],
    [403, 'not_admin'],
  ])('turns a %i %s into a 500 server.error', async (status, errorCode) => {
    answer(status, { code: status, error_code: errorCode, msg: 'Refused' })

    const failure = await failureOf(client().deleteFactor(USER_ID, FACTOR_ID))

    expect(toErrorResponse(failure)).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })

  it('turns a 5xx and a transport failure into a 503 server.unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    answer(502, { code: 502, msg: 'Down' })
    expect(
      toErrorResponse(await failureOf(client().deleteFactor(USER_ID, FACTOR_ID))),
    ).toMatchObject({ status: 503, body: { code: 'server.unavailable' } })

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    )
    expect(
      toErrorResponse(await failureOf(client().deleteFactor(USER_ID, FACTOR_ID))),
    ).toMatchObject({ status: 503, body: { code: 'server.unavailable' } })
  })
})

describe('AuthAdminClient.factorIds', () => {
  it('lists the ids of the factors of the user', async () => {
    const fetch = answer(200, [
      { id: FACTOR_ID, factor_type: 'totp', status: 'verified' },
      { id: USER_ID, factor_type: 'totp', status: 'unverified' },
    ])

    expect(await client().factorIds(USER_ID)).toEqual([FACTOR_ID, USER_ID])

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://supabase.test/auth/v1/admin/users/${USER_ID}/factors`)
    expect(init.method).toBe('GET')
  })

  it('answers no ids for a user already gone', async () => {
    answer(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })

    expect(await client().factorIds(USER_ID)).toEqual([])
  })

  it('turns a 5xx into a 503 server.unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    answer(503, { code: 503, msg: 'Down' })

    expect(toErrorResponse(await failureOf(client().factorIds(USER_ID)))).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
    })
  })
})
