import { randomUUID } from 'node:crypto'
import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { type AccountsRepository } from '../../modules/accounts/accounts.repository'
import { type TenantContextService } from '../als/tenant-context.service'
import { ApiError } from '../errors/api-error'
import { toErrorResponse } from '../filters/http-exception.filter'
import { type AccessTokenVerifier, type TokenCheck } from './access-token'
import { JwtAuthGuard } from './jwt-auth.guard'
import { rateLimitTracker } from '../rate-limit/rate-limit'

const env = { PORTAL_URL: 'https://opos.land', PANEL_URL: 'https://panel.opos.land' }

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
      env,
    ),
  }
}

const execution = (authorization?: string, request?: object) => {
  const req = request ?? { headers: authorization ? { authorization } : {} }
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

const withCookie = (headers: Record<string, string | undefined>) =>
  execution(undefined, { headers })

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
      app_metadata: { providers: ['email', 'google'] },
    }
    const { subject, accounts, context } = guard({ status: 'valid', payload })

    expect(await subject.canActivate(execution('Bearer abc'))).toBe(true)

    expect(accounts.findForToken).toHaveBeenCalledWith(account.id)
    expect(context.setAccount).toHaveBeenCalledWith(account, 1_900_000_000, ['password', 'google'])
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

  it("verifies the access cookie of the Origin's application", async () => {
    const { subject, verifier } = guard({ status: 'valid', payload: { sub: account.id } })

    await subject.canActivate(
      withCookie({ cookie: 'opos_panel_access=from-cookie', origin: 'https://panel.opos.land' }),
    )

    expect(verifier.verify).toHaveBeenCalledWith('from-cookie')
  })

  it('reads the cookie before Authorization: Bearer', async () => {
    const { subject, verifier } = guard({ status: 'valid', payload: { sub: account.id } })

    await subject.canActivate(
      withCookie({
        cookie: 'opos_portal_access=from-cookie',
        origin: 'https://opos.land',
        authorization: 'Bearer from-header',
      }),
    )

    expect(verifier.verify).toHaveBeenCalledWith('from-cookie')
  })

  it('answers 401 for the cookie of the other application or of no Origin', async () => {
    const { subject, verifier } = guard({ status: 'valid', payload: { sub: account.id } })

    for (const headers of [
      { cookie: 'opos_panel_access=t', origin: 'https://opos.land' },
      { cookie: 'opos_portal_access=t' },
    ]) {
      const failure = await refusal(subject.canActivate(withCookie(headers)))
      expect(toErrorResponse(failure)).toMatchObject({
        status: 401,
        body: { code: 'session.invalid' },
      })
    }
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('shares one verification with the rate limit, an unavailable outcome included', async () => {
    const { subject, verifier } = guard({ status: 'unavailable' })
    const request = {
      ip: '192.0.2.1',
      headers: { cookie: 'opos_portal_access=t', origin: 'https://opos.land' },
    }

    const tracked = await rateLimitTracker(verifier, env)(request, {} as ExecutionContext)
    const failure = await refusal(subject.canActivate(execution(undefined, request)))

    expect(tracked).toBe('ip:192.0.2.1')
    expect(toErrorResponse(failure)).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
    })
    expect(verifier.verify).toHaveBeenCalledTimes(1)
  })
})
