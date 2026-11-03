import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { type AccountsRepository } from '../../modules/accounts/accounts.repository'
import { type TenantContextService } from '../als/tenant-context.service'
import { ApiError } from '../errors/api-error'
import { toErrorResponse } from '../filters/http-exception.filter'
import { type AccessTokenVerifier, type TokenCheck } from './access-token'
import { JwtAuthGuard } from './jwt-auth.guard'

const account = { id: randomUUID() }

function guard(check: TokenCheck, found: unknown = account) {
  const verifier = {
    verify: vi.fn<AccessTokenVerifier['verify']>(() => Promise.resolve(check)),
    close: vi.fn(),
  }
  const accounts = { findForToken: vi.fn(() => Promise.resolve(found)) }
  const context = { setAccount: vi.fn() }
  return {
    verifier,
    accounts,
    context,
    subject: new JwtAuthGuard(
      verifier,
      accounts as unknown as AccountsRepository,
      context as unknown as TenantContextService,
    ),
  }
}

const execution = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  }) as unknown as ExecutionContext

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('JwtAuthGuard', () => {
  it('puts the account of a valid token into the request store', async () => {
    const payload = {
      sub: account.id,
      amr: [{ method: 'password', timestamp: 1_900_000_000 }],
    }
    const { subject, accounts, context } = guard({ status: 'valid', payload })

    expect(await subject.canActivate(execution('Bearer abc'))).toBe(true)

    expect(accounts.findForToken).toHaveBeenCalledWith(account.id)
    expect(context.setAccount).toHaveBeenCalledWith(account, 1_900_000_000)
  })

  it('answers 401 session.invalid without a token, asking the verifier nothing', async () => {
    const { subject, verifier } = guard({ status: 'invalid' })

    const failure = await refusal(subject.canActivate(execution()))

    expect(failure).toBeInstanceOf(ApiError)
    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('answers 401 session.invalid for a foreign signature', async () => {
    const { subject, accounts } = guard({ status: 'invalid' })

    const failure = await refusal(subject.canActivate(execution('Bearer forged')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(accounts.findForToken).not.toHaveBeenCalled()
  })

  it('answers 503 server.unavailable with Retry-After when keys cannot be fetched', async () => {
    const { subject, accounts } = guard({ status: 'unavailable' })

    const failure = await refusal(subject.canActivate(execution('Bearer abc')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
      headers: { 'Retry-After': '30' },
    })
    expect(accounts.findForToken).not.toHaveBeenCalled()
  })

  it('answers 401 session.invalid for a valid token without an accounts row', async () => {
    const { subject, context } = guard({ status: 'valid', payload: { sub: account.id } }, null)

    const failure = await refusal(subject.canActivate(execution('Bearer abc')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(context.setAccount).not.toHaveBeenCalled()
  })
})
