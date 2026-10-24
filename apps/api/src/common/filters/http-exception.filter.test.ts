import {
  type ArgumentsHost,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ORPCError, ValidationError } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError } from '../errors/api-error'
import { HttpExceptionFilter, toErrorResponse } from './http-exception.filter'

describe('toErrorResponse', () => {
  it('keeps the code and params of an ApiError', () => {
    expect(toErrorResponse(new ApiError(409, 'request.invalid', 'Taken', { slug: 'x' }))).toEqual({
      status: 409,
      body: { code: 'request.invalid', params: { slug: 'x' }, message: 'Taken' },
    })
  })

  // What oRPC throws for an input that fails the contract's schema.
  const refused = (schema: z.ZodType, input: unknown) => {
    const result = schema.safeParse(input)
    const issues = result.success ? [] : result.error.issues
    return new ORPCError('BAD_REQUEST', {
      cause: new ValidationError({ message: 'Input validation failed', issues, data: input }),
    })
  }

  it('names the first invalid field of an input, below params, query or body', () => {
    const schema = z.object({ body: z.object({ locale: z.enum(['en', 'pl']) }) })

    expect(toErrorResponse(refused(schema, { body: { locale: 'cs' } }))).toMatchObject({
      status: 400,
      body: { code: 'request.invalid', params: { field: 'locale' } },
    })
  })

  it('names an unknown key itself', () => {
    const schema = z.object({ body: z.object({}).strict() })

    expect(toErrorResponse(refused(schema, { body: { email: 'x' } }))).toMatchObject({
      status: 400,
      body: { code: 'request.invalid', params: { field: 'email' } },
    })
  })

  it.each([
    [new NotFoundException(), 404, 'request.not-found'],
    [new ForbiddenException(), 403, 'permission.denied'],
    [Object.assign(new Error('bad json'), { status: 400 }), 400, 'request.invalid'],
  ])('maps %s by its status', (exception, status, code) => {
    expect(toErrorResponse(exception)).toMatchObject({ status, body: { code } })
  })

  it('hides the message of a 5xx HttpException', () => {
    expect(
      toErrorResponse(new InternalServerErrorException('password=secret at 10.0.0.5')),
    ).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })

  // A Postgres error as drizzle throws it: the query error carries the driver's error as its cause.
  const violated = (constraint: string) =>
    Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('violates check constraint'), { constraint_name: constraint }),
    })

  it.each([
    ['editions_slug_format', 'slug'],
    ['editions_ends_after_start', 'endsAt'],
    ['tenant_memberships_head_never_expires', 'expiresAt'],
  ])('maps a violated %s to 400 for its field', (constraint, field) => {
    expect(toErrorResponse(violated(constraint))).toMatchObject({
      status: 400,
      body: { code: 'request.invalid', params: { field } },
    })
  })

  it.each([
    ['tenant_memberships_account_tenant_unique', 'member.exists'],
    ['accepted_invitations_tenant_jti_unique', 'invitation.used'],
  ])('maps a violated %s to 409 %s', (constraint, code) => {
    expect(toErrorResponse(violated(constraint))).toMatchObject({ status: 409, body: { code } })
  })

  it('hides the details of an unexpected error', () => {
    expect(toErrorResponse(new Error('connection refused at 10.0.0.1'))).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })
})

describe('HttpExceptionFilter once the response is out', () => {
  const host = (response: object) =>
    ({ switchToHttp: () => ({ getResponse: () => response }) }) as unknown as ArgumentsHost
  const response = (writableEnded: boolean) => ({
    headersSent: true,
    writableEnded,
    destroy: vi.fn(),
    status: vi.fn(),
  })

  it('drops the second reply Nest attempts after oRPC answered', () => {
    const sent = response(true)
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})

    new HttpExceptionFilter().catch(
      Object.assign(new Error('Cannot remove headers'), { code: 'ERR_HTTP_HEADERS_SENT' }),
      host(sent),
    )
    expect(sent.status).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('logs any other error and closes a response left open', () => {
    const open = response(false)
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})

    new HttpExceptionFilter().catch(new Error('socket hang up'), host(open))
    expect(log).toHaveBeenCalled()
    expect(open.destroy).toHaveBeenCalled()
    expect(open.status).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('HttpExceptionFilter', () => {
  it('sends the headers of an ApiError with its body', () => {
    const json = vi.fn()
    const response = {
      headersSent: false,
      writableEnded: false,
      destroy: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => ({ json })),
    }
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost

    new HttpExceptionFilter().catch(
      new ApiError(429, 'request.rate-limited', 'Slow down', undefined, { 'Retry-After': '42' }),
      host,
    )
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '42')
    expect(response.status).toHaveBeenCalledWith(429)
    expect(json).toHaveBeenCalledWith({ code: 'request.rate-limited', message: 'Slow down' })
  })
})
