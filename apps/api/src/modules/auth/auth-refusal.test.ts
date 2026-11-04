import { inspect } from 'node:util'
import { Logger } from '@nestjs/common'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/auth-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../common/errors/api-error'
import { toErrorResponse } from '../../common/filters/http-exception.filter'
import { isAnswered5xx, isHookFailure, toApiError } from './auth-refusal'
import { NO_AUTH_ANSWER } from './supabase-auth.factory'

const apiError = (status: number, code: string | undefined) =>
  new AuthApiError('refused', status, code)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isAnswered5xx', () => {
  it('holds for a 5xx Supabase Auth answered, which carries its code', () => {
    expect(isAnswered5xx(apiError(599, 'unexpected_failure'))).toBe(true)
    expect(isAnswered5xx(apiError(500, 'unexpected_failure'))).toBe(true)
  })

  it.each([
    ['a failure Supabase Auth did not answer', apiError(599, NO_AUTH_ANSWER)],
    ['a 5xx without a code', apiError(599, undefined)],
    ['a refusal below 500', apiError(429, 'over_email_send_rate_limit')],
    ['a failure auth-js could not read', new AuthRetryableFetchError('down', 0)],
    ['an error not from auth-js', new TypeError('boom')],
  ])('does not hold for %s', (_, error) => {
    expect(isAnswered5xx(error)).toBe(false)
  })
})

describe('isHookFailure', () => {
  it.each(['hook_timeout', 'hook_timeout_after_retry', 'hook_payload_over_size_limit'])(
    'holds for the code %s',
    (code) => {
      expect(isHookFailure(apiError(422, code))).toBe(true)
    },
  )

  it.each([
    ['another code', apiError(422, 'validation_failed')],
    ['no code', apiError(422, undefined)],
    ['an error not from auth-js', new TypeError('hook_timeout')],
  ])('does not hold for %s', (_, error) => {
    expect(isHookFailure(error)).toBe(false)
  })
})

describe('toApiError', () => {
  it.each([
    [new AuthSessionMissingError(), 401, 'session.invalid'],
    [apiError(403, 'session_not_found'), 401, 'session.invalid'],
    [apiError(400, 'refresh_token_not_found'), 401, 'session.invalid'],
    [apiError(400, 'refresh_token_already_used'), 401, 'session.invalid'],
    [apiError(403, 'bad_jwt'), 401, 'session.invalid'],
    [apiError(404, 'user_not_found'), 401, 'session.invalid'],
    [apiError(400, 'invalid_credentials'), 400, 'auth.invalid_credentials'],
    [apiError(400, 'email_not_confirmed'), 400, 'auth.email_not_confirmed'],
    [apiError(422, 'weak_password'), 422, 'auth.weak_password'],
    [apiError(422, 'same_password'), 422, 'auth.same_password'],
    [apiError(403, 'otp_expired'), 403, 'auth.otp_expired'],
    [apiError(422, 'email_address_invalid'), 422, 'auth.email_address_invalid'],
    [apiError(429, 'over_email_send_rate_limit'), 429, 'auth.over_email_send_rate_limit'],
    [apiError(429, 'over_request_rate_limit'), 429, 'auth.over_request_rate_limit'],
    [apiError(401, 'insufficient_aal'), 401, 'session.mfa-required'],
    [apiError(422, 'mfa_verification_failed'), 400, 'mfa.code-invalid'],
    [apiError(400, 'something_new'), 500, 'server.error'],
    [apiError(503, undefined), 503, 'server.unavailable'],
    [new AuthRetryableFetchError('down', 0), 503, 'server.unavailable'],
  ])('maps %s', (error, status, code) => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const mapped = toApiError(error)

    expect(mapped).toBeInstanceOf(ApiError)
    expect(mapped.getStatus()).toBe(status)
    expect(mapped.code).toBe(code)
  })

  it.each([
    'email_not_confirmed',
    'invalid_credentials',
    'weak_password',
    'same_password',
    'otp_expired',
    'email_address_invalid',
    'over_email_send_rate_limit',
    'over_request_rate_limit',
  ])('answers %s with a message of its own, never the text of Supabase Auth', (code) => {
    const theirs = `Supabase wording for ${code}: user x@example.test, hint ${'y'.repeat(20)}`

    const { body } = toErrorResponse(toApiError(new AuthApiError(theirs, 400, code)))

    expect(body.message).not.toContain('Supabase')
    expect(body.message).not.toContain('x@example.test')
    expect(body.message).toMatch(/^[A-Z][^.]*\.$/)
  })

  it('asks to retry in 30 seconds on an outage', () => {
    expect(toApiError(apiError(502, undefined)).headers).toEqual({ 'Retry-After': '30' })
  })

  it.each([
    ['a 5xx', new AuthApiError('HTTP 502 with a body that is not JSON', 599, NO_AUTH_ANSWER)],
    [
      'a transport failure',
      new AuthApiError('fetch failed: connect ECONNREFUSED', 599, NO_AUTH_ANSWER),
    ],
    ['a failure auth-js retries', new AuthRetryableFetchError('fetch failed', 0)],
  ])('carries the reason of %s to the log line, never to the body', (_, error) => {
    const mapped = toApiError(error)

    expect(mapped.logLine).toBe(`Supabase Auth is unavailable: ${error.message}`)
    expect(toErrorResponse(mapped).body.message).toBe('Supabase Auth is unavailable')
  })

  it('logs what maps to 500, and only that', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    toApiError(apiError(400, 'invalid_credentials'))
    toApiError(apiError(503, undefined))
    expect(logged).not.toHaveBeenCalled()

    toApiError(apiError(400, 'something_new'))
    expect(logged).toHaveBeenCalledTimes(1)
  })

  it('logs the code and the status of an unlisted refusal, never its text', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    toApiError(
      new AuthApiError(
        'Address anna.secret@example.test is not authorized',
        422,
        'email_address_not_authorized',
      ),
    )

    expect(logged).toHaveBeenCalledTimes(1)
    const line = inspect(logged.mock.calls)
    expect(line).toContain('email_address_not_authorized')
    expect(line).toContain('422')
    expect(line).not.toMatch(/anna|secret|example/)
  })

  it('maps an error that is not from auth-js to 500, logged', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const mapped = toApiError(new TypeError('boom'))

    expect(mapped.getStatus()).toBe(500)
    expect(mapped.code).toBe('server.error')
    expect(logged).toHaveBeenCalledTimes(1)
  })

  it('hands an ApiError back as it is', () => {
    const original = new ApiError(403, 'permission.denied', 'no')

    expect(toApiError(original)).toBe(original)
  })
})
