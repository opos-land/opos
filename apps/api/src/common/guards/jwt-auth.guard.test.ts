import { randomUUID } from 'node:crypto'
import { type ExecutionContext, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import { type AccountsRepository } from '../../modules/accounts/accounts.repository'
import { ALLOW_MFA_PENDING, AllowMfaPending } from '../decorators/allow-mfa-pending.decorator'
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
      new Reflector(),
    ),
  }
}

class Plain {
  open() {}
}

class Pending {
  @AllowMfaPending()
  open() {}
}

/** The method a route would be: the decorator's metadata sits on it. */
const handlerOf = (type: { prototype: object }) => Reflect.get(type.prototype, 'open') as object

const execution = (request: object, handler: object = handlerOf(Plain)) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  }) as unknown as ExecutionContext

const withCookie = (headers: Record<string, string | undefined>) => execution({ headers })

/** A request of the portal that carries `token` in its access cookie. */
const signedIn = (token = 'abc') =>
  withCookie({ cookie: `opos_portal_access=${token}`, origin: 'https://opos.land' })

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

    expect(await subject.canActivate(signedIn())).toBe(true)

    expect(accounts.findForToken).toHaveBeenCalledWith(account.id)
    expect(context.setAccount).toHaveBeenCalledWith(account, 1_900_000_000, ['password', 'google'])
  })

  it('answers 401 session.invalid without a token, asking the verifier nothing', async () => {
    const { subject, verifier } = guard({ status: 'invalid' })

    const failure = await refusal(subject.canActivate(withCookie({})))

    expect(failure).toBeInstanceOf(ApiError)
    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('answers 401 session.invalid for a foreign signature', async () => {
    const { subject, accounts } = guard({ status: 'invalid' })

    const failure = await refusal(subject.canActivate(signedIn('forged')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(accounts.findForToken).not.toHaveBeenCalled()
  })

  it('answers 503 server.unavailable with Retry-After when keys cannot be fetched', async () => {
    const { subject, accounts } = guard({ status: 'unavailable' })

    const failure = await refusal(subject.canActivate(signedIn()))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
      headers: { 'Retry-After': '30' },
    })
    expect(accounts.findForToken).not.toHaveBeenCalled()
  })

  it('answers 401 session.invalid for a valid token without an accounts row', async () => {
    const { subject, context } = guard({ status: 'valid', payload: { sub: account.id } }, null)

    const failure = await refusal(subject.canActivate(signedIn()))

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

  it('answers 401 for Authorization: Bearer, which only the scanner will send', async () => {
    const { subject, verifier } = guard({ status: 'valid', payload: { sub: account.id } })

    const failure = await refusal(
      subject.canActivate(
        withCookie({ authorization: 'Bearer from-header', origin: 'https://opos.land' }),
      ),
    )

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.invalid' },
    })
    expect(verifier.verify).not.toHaveBeenCalled()
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
    const failure = await refusal(subject.canActivate(execution(request)))

    expect(tracked).toBe('ip:192.0.2.1')
    expect(toErrorResponse(failure)).toMatchObject({
      status: 503,
      body: { code: 'server.unavailable' },
    })
    expect(verifier.verify).toHaveBeenCalledTimes(1)
  })

  describe('two-factor authentication', () => {
    const withFactor = { id: account.id, mfaEnabled: true }
    // The verification is kept on the request, so each test builds its own.
    const portalRequest = () => ({
      headers: { cookie: 'opos_portal_access=t', origin: 'https://opos.land' },
    })

    it.each([undefined, 'aal1'] as const)(
      'answers 401 session.mfa-required at level %s on an account with 2FA',
      async (aal) => {
        const { subject, context } = guard(
          { status: 'valid', payload: { sub: account.id, aal } },
          withFactor,
        )

        const failure = await refusal(subject.canActivate(execution(portalRequest())))

        expect(failure).toBeInstanceOf(ApiError)
        expect(toErrorResponse(failure)).toMatchObject({
          status: 401,
          body: { code: 'session.mfa-required' },
        })
        expect(context.setAccount).not.toHaveBeenCalled()
      },
    )

    it('lets aal2 through', async () => {
      const { subject } = guard(
        { status: 'valid', payload: { sub: account.id, aal: 'aal2' } },
        withFactor,
      )

      expect(await subject.canActivate(execution(portalRequest()))).toBe(true)
    })

    it('lets aal1 through on an account without 2FA', async () => {
      const { subject } = guard(
        { status: 'valid', payload: { sub: account.id, aal: 'aal1' } },
        { id: account.id, mfaEnabled: false },
      )

      expect(await subject.canActivate(execution(portalRequest()))).toBe(true)
    })

    it('lets aal1 through on a handler marked @AllowMfaPending, and still sets the account', async () => {
      const { subject, context } = guard(
        { status: 'valid', payload: { sub: account.id, aal: 'aal1' } },
        withFactor,
      )

      expect(await subject.canActivate(execution(portalRequest(), handlerOf(Pending)))).toBe(true)
      expect(context.setAccount).toHaveBeenCalledTimes(1)
    })

    it('reads the exemption from the handler alone, never from the controller class', async () => {
      const { subject } = guard(
        { status: 'valid', payload: { sub: account.id, aal: 'aal1' } },
        withFactor,
      )
      @SetMetadata(ALLOW_MFA_PENDING, true)
      class Marked {}
      const onClass = {
        switchToHttp: () => ({ getRequest: () => portalRequest() }),
        getHandler: () => handlerOf(Plain),
        getClass: () => Marked,
      } as unknown as ExecutionContext

      const failure = await refusal(subject.canActivate(onClass))

      expect(toErrorResponse(failure)).toMatchObject({ body: { code: 'session.mfa-required' } })
    })

    it('answers session.invalid before session.mfa-required when no account exists', async () => {
      const { subject } = guard(
        { status: 'valid', payload: { sub: account.id, aal: 'aal1' } },
        null,
      )

      const failure = await refusal(subject.canActivate(execution(portalRequest())))

      expect(toErrorResponse(failure)).toMatchObject({ body: { code: 'session.invalid' } })
    })
  })
})
