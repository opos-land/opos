import { errorMessages, unknownError } from '@opos/i18n/errors'
import { ORPCError } from '@orpc/client'
import { AuthApiError } from '@supabase/auth-js'
import { describe, expect, it } from 'vitest'
import { decodeApiError, describeError, errorCode, isNotFound, isPermissionDenied } from './errors'

describe('decodeApiError', () => {
  it('reads the code, the params and the status of the API error body', () => {
    const error = decodeApiError(
      { code: 'request.invalid', params: { field: 'slug' }, message: 'Invalid input' },
      400,
    )

    expect(error).toBeInstanceOf(ORPCError)
    expect(error).toMatchObject({ code: 'request.invalid', status: 400, data: { field: 'slug' } })
  })

  it('leaves a body without a code to oRPC', () => {
    expect(decodeApiError({ error: 'nope' }, 500)).toBeNull()
    expect(decodeApiError('Bad Gateway', 502)).toBeNull()
  })
})

describe('describeError', () => {
  it('picks the message by the API code, never by the message field', () => {
    const error = new ORPCError('member.above-own', {
      status: 403,
      message: 'Cannot grant above own permissions',
    })

    expect(describeError(error).message).toBe(errorMessages['member.above-own'])
  })

  it('hands the params to the message', () => {
    const error = new ORPCError('request.invalid', { status: 400, data: { field: 'endsAt' } })

    expect(describeError(error).values).toEqual({ field: 'endsAt' })
  })

  it('maps a Supabase Auth error code under auth.', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')

    expect(errorCode(error)).toBe('auth.invalid_credentials')
    expect(describeError(error).message).toBe(errorMessages['auth.invalid_credentials'])
  })

  it('shows the generic message for an unknown code or an error without one', () => {
    expect(describeError(new ORPCError('something.new', { status: 409 })).message).toBe(
      unknownError,
    )
    expect(describeError(new TypeError('Failed to fetch')).message).toBe(unknownError)
    expect(describeError(new AuthApiError('boom', 500, undefined)).message).toBe(unknownError)
  })
})

describe('error kinds', () => {
  it('tells a plain refusal from an anti-escalation one', () => {
    expect(isPermissionDenied(new ORPCError('permission.denied', { status: 403 }))).toBe(true)
    expect(isPermissionDenied(new ORPCError('member.self', { status: 403 }))).toBe(false)
    expect(isNotFound(new ORPCError('request.not-found', { status: 404 }))).toBe(true)
  })
})
