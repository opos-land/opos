import { ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ORPCError, ValidationError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { ApiError } from '../errors/api-error'
import { toErrorResponse } from './http-exception.filter'

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

  it('hides the details of an unexpected error', () => {
    expect(toErrorResponse(new Error('connection refused at 10.0.0.1'))).toEqual({
      status: 500,
      body: { code: 'server.error', message: 'Internal server error' },
    })
  })
})
