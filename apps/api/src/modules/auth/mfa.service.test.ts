import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { AuthApiError } from '@supabase/auth-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { type RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { toErrorResponse } from '../../common/filters/http-exception.filter'
import { type Env } from '../../config/env'
import { type MailService } from '../mail/mail.service'
import { type AuthAdminClient } from './auth-admin.client'
import { MfaService } from './mfa.service'
import { hashRecoveryCode } from './recovery-code'
import { RecoveryCodeStoreError, type RecoveryCodesRepository } from './recovery-codes.repository'
import { type SupabaseAuthFactory } from './supabase-auth.factory'

// The order of the calls is what these tests pin: a failed removal spends no recovery code, a
// failed email after a removal still answers, and `enable` replaces leftovers (PLAN.md 7.12).

const env = {
  PORTAL_URL: 'http://portal.test',
  PANEL_URL: 'http://panel.test',
  API_URL: 'http://api.test',
}
const accountId = randomUUID()
const factorId = randomUUID()
const otherFactorId = randomUUID()

/** A token of the portal at `aal`; the service reads only the level of it. */
const token = (aal: 'aal1' | 'aal2') =>
  `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.`

const request = (aal: 'aal1' | 'aal2' = 'aal1') => ({
  headers: {
    origin: 'http://portal.test',
    cookie: `opos_portal_access=${token(aal)}; opos_portal_refresh=refresh-1`,
  },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
})

const session = { access_token: token('aal2'), refresh_token: 'refresh-2', expires_in: 3600 }

function setup(
  options: {
    mfaEnabled?: boolean
    factors?: { id: string; status: 'verified' | 'unverified' }[]
  } = {},
) {
  const calls: string[] = []
  const log = <T>(name: string, value: T) =>
    vi.fn((..._args: unknown[]) => {
      calls.push(name)
      return Promise.resolve(value)
    })
  // The session the client holds: the request's own until a call replaces it.
  const held = { current: { ...session, access_token: token('aal1') } as typeof session | null }
  const mfa = {
    listFactors: log('listFactors', {
      data: { all: options.factors ?? [{ id: factorId, status: 'verified' }] },
      error: null,
    }),
    unenroll: log('unenroll', { data: {}, error: null }),
    enroll: log('enroll', {
      data: {
        id: factorId,
        totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DP' },
      },
      error: null,
    }),
    challengeAndVerify: vi.fn((..._args: unknown[]) => {
      calls.push('challengeAndVerify')
      held.current = session
      return Promise.resolve({ data: session, error: null })
    }),
  }
  const client = {
    setSession: log('setSession', { data: { session: null }, error: null }),
    getSession: vi.fn(() => {
      calls.push('getSession')
      return Promise.resolve({ data: { session: held.current }, error: null })
    }),
    signOut: log('signOut', { error: null }),
    mfa,
  }
  const admin = {
    deleteFactor: log('deleteFactor', true),
  }
  const codes = {
    replaceUnused: log('replaceUnused', true),
    hasUnused: log('hasUnused', true),
    holdsUnused: log('holdsUnused', true),
    markUsed: log('markUsed', true),
    deleteUnused: log('deleteUnused', undefined),
  }
  const mail = { sendNoticeEmail: log('sendNoticeEmail', undefined) }
  const limiter = { consume: log('consume', undefined) }
  const context = {
    account: () => ({
      id: accountId,
      email: 'person@example.test',
      locale: 'pl',
      mfaEnabled: options.mfaEnabled ?? true,
    }),
    signedInWithin: vi.fn(() => true),
  }
  const service = new MfaService(
    env as Env,
    { forRequest: () => client } as unknown as SupabaseAuthFactory,
    admin as unknown as AuthAdminClient,
    codes as unknown as RecoveryCodesRepository,
    context as unknown as TenantContextService,
    limiter as unknown as RouteRateLimiter,
    mail as unknown as MailService,
  )
  return { service, calls, mfa, client, admin, codes, mail, limiter, context, held }
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MfaService.recover', () => {
  const body = { code: 'abcd-efgh-ijkl-mnop' }

  it('removes the factors first, then spends the code, then drops the unused ones, then mails', async () => {
    const { service, calls, codes, admin } = setup({
      factors: [
        { id: factorId, status: 'verified' },
        { id: otherFactorId, status: 'unverified' },
      ],
    })

    await service.recover(request(), body)

    expect(calls).toEqual([
      'consume',
      'setSession',
      'hasUnused',
      'listFactors',
      'deleteFactor',
      'deleteFactor',
      'signOut',
      'markUsed',
      'deleteUnused',
      'getSession',
      'sendNoticeEmail',
    ])
    expect(admin.deleteFactor).toHaveBeenCalledWith(accountId, factorId)
    expect(admin.deleteFactor).toHaveBeenCalledWith(accountId, otherFactorId)
    expect(codes.hasUnused).toHaveBeenCalledWith(hashRecoveryCode('ABCDEFGHIJKLMNOP'))
  })

  it('spends nothing when the removal fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { service, admin, codes, mail } = setup()
    admin.deleteFactor.mockRejectedValueOnce(new Error('Supabase Auth refused deleteFactor'))

    const failure = await failureOf(service.recover(request(), body))

    expect(failure).toBeInstanceOf(Error)
    expect(codes.markUsed).not.toHaveBeenCalled()
    expect(codes.deleteUnused).not.toHaveBeenCalled()
    expect(mail.sendNoticeEmail).not.toHaveBeenCalled()
  })

  it('answers mfa.code-invalid for a code the account does not hold, touching no factor', async () => {
    const { service, codes, admin } = setup()
    codes.hasUnused.mockResolvedValueOnce(false)

    const failure = await failureOf(service.recover(request(), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 400,
      body: { code: 'mfa.code-invalid' },
    })
    expect(admin.deleteFactor).not.toHaveBeenCalled()
  })

  it('answers mfa.code-invalid when another request spent the code first, and mails nothing', async () => {
    const { service, codes, mail } = setup()
    codes.markUsed.mockResolvedValueOnce(false)

    const failure = await failureOf(service.recover(request(), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 400,
      body: { code: 'mfa.code-invalid' },
    })
    expect(mail.sendNoticeEmail).not.toHaveBeenCalled()
  })

  it('still answers when the email fails, and logs it without the code', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, mail } = setup()
    mail.sendNoticeEmail.mockRejectedValueOnce(new Error('smtp down'))

    await expect(service.recover(request(), body)).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).not.toContain('ABCDEFGHIJKLMNOP')
  })

  it('mails the account in its locale', async () => {
    const { service, mail } = setup()

    await service.recover(request(), body)

    expect(mail.sendNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'person@example.test', locale: 'pl' }),
    )
  })

  it.each([
    ['an account without 2FA', { mfaEnabled: false }, 'aal1'],
    ['a session at aal2', {}, 'aal2'],
  ] as const)('answers 409 mfa.not-required for %s', async (_, options, aal) => {
    const { service, codes, admin } = setup(options)

    const failure = await failureOf(service.recover(request(aal), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 409,
      body: { code: 'mfa.not-required' },
    })
    expect(codes.hasUnused).not.toHaveBeenCalled()
    expect(admin.deleteFactor).not.toHaveBeenCalled()
  })

  it('ends the other sessions of the account once the factors are gone, and keeps this one', async () => {
    const { service, client, calls } = setup()

    await service.recover(request(), body)

    expect(client.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(calls.indexOf('signOut')).toBeGreaterThan(calls.lastIndexOf('deleteFactor'))
  })

  it('answers 204 when ending the other sessions fails, logging it', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, client, codes } = setup()
    client.signOut.mockResolvedValueOnce({ error: new Error('gotrue down') } as never)

    await expect(service.recover(request(), body)).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(codes.markUsed).toHaveBeenCalled()
  })

  it('does not end any session when the removal fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { service, client, admin } = setup()
    admin.deleteFactor.mockRejectedValueOnce(new Error('refused'))

    await failureOf(service.recover(request(), body))

    expect(client.signOut).not.toHaveBeenCalled()
  })

  it.each(['markUsed', 'deleteUnused'] as const)(
    'mails the notice although %s throws after the factors are gone',
    async (step) => {
      const { service, codes, mail } = setup()
      const outage = new RecoveryCodeStoreError(step, new Error('database down'))
      codes[step].mockRejectedValueOnce(outage)

      const failure = await failureOf(service.recover(request(), body))

      expect(failure).toBe(outage)
      expect(mail.sendNoticeEmail).toHaveBeenCalledTimes(1)
    },
  )

  it('lets a failure of the code store through as it is, not as a Supabase Auth answer', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { service, codes } = setup()
    const failure = new RecoveryCodeStoreError('hasUnused', new Error('database down'))
    codes.hasUnused.mockRejectedValueOnce(failure)

    expect(await failureOf(service.recover(request(), body))).toBe(failure)
    expect(error).not.toHaveBeenCalled()
  })

  it('writes the cookies of a session the client refreshed on the way, although the code is wrong', async () => {
    const { service, mfa, held } = setup()
    held.current = session
    mfa.listFactors.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
    } as never)
    const req = request()

    await failureOf(service.recover(req, body))

    expect(req.res.cookie).toHaveBeenCalledWith(
      'opos_portal_access',
      session.access_token,
      expect.anything(),
    )
    expect(req.res.cookie).toHaveBeenCalledWith(
      'opos_portal_refresh',
      session.refresh_token,
      expect.anything(),
    )
  })

  it('counts the attempt before anything else', async () => {
    const { service, limiter } = setup()

    await service.recover(request(), body)

    expect(limiter.consume).toHaveBeenCalledWith('mfa', `account:${accountId}`)
  })
})

describe('MfaService.enable', () => {
  const body = { factorId, code: '123456' }

  it('stores the new codes before the factor is verified, and returns the codes it stored', async () => {
    const { service, calls, codes } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })
    const req = request()

    const result = await service.enable(req, body)

    expect(calls.indexOf('replaceUnused')).toBeGreaterThan(-1)
    expect(calls.indexOf('replaceUnused')).toBeLessThan(calls.indexOf('challengeAndVerify'))
    const stored = codes.replaceUnused.mock.calls[0]![0] as string[]
    expect(result.recoveryCodes).toHaveLength(10)
    expect(stored).toEqual(result.recoveryCodes.map(hashRecoveryCode))
    expect(req.res.cookie).toHaveBeenCalledTimes(2)
  })

  it('answers 404 for a factor the session does not list, storing nothing', async () => {
    const { service, codes, mfa } = setup({
      mfaEnabled: false,
      factors: [{ id: otherFactorId, status: 'unverified' }],
    })

    const failure = await failureOf(service.enable(request(), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 404,
      body: { code: 'request.not-found' },
    })
    expect(codes.replaceUnused).not.toHaveBeenCalled()
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
  })

  it.each([
    ['an account with 2FA', { mfaEnabled: true }],
    [
      'a verified factor',
      { mfaEnabled: false, factors: [{ id: factorId, status: 'verified' as const }] },
    ],
  ])('answers 409 mfa.already-enabled for %s, storing nothing', async (_, options) => {
    const { service, codes } = setup(options)

    const failure = await failureOf(service.enable(request(), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 409,
      body: { code: 'mfa.already-enabled' },
    })
    expect(codes.replaceUnused).not.toHaveBeenCalled()
  })

  it('answers 409 mfa.already-enabled when the store refuses the replacement, verifying nothing', async () => {
    const { service, codes, mfa } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })
    codes.replaceUnused.mockResolvedValueOnce(false)

    const failure = await failureOf(service.enable(request(), body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 409,
      body: { code: 'mfa.already-enabled' },
    })
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
  })

  it('answers mfa.code-invalid for a wrong code and sets no cookie', async () => {
    const { service, mfa } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })
    mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
    } as never)
    const req = request()

    const failure = await failureOf(service.enable(req, body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 400,
      body: { code: 'mfa.code-invalid' },
    })
    expect(req.res.cookie).not.toHaveBeenCalled()
  })

  it('answers 409 mfa.already-enabled when the codes it stored were replaced, still setting the aal2 cookies', async () => {
    const { service, codes } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })
    codes.holdsUnused.mockResolvedValueOnce(false)
    const req = request()

    const failure = await failureOf(service.enable(req, body))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 409,
      body: { code: 'mfa.already-enabled' },
    })
    expect(req.res.cookie).toHaveBeenCalledWith(
      'opos_portal_access',
      session.access_token,
      expect.anything(),
    )
    const stored = codes.replaceUnused.mock.calls[0]![0] as string[]
    expect(codes.holdsUnused).toHaveBeenCalledWith(stored)
  })

  it('writes the cookies of a refreshed session when the code is wrong', async () => {
    const { service, mfa, held } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })
    mfa.challengeAndVerify.mockImplementationOnce(() => {
      held.current = { ...session, access_token: token('aal1') + 'x' }
      return Promise.resolve({
        data: null,
        error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
      }) as never
    })
    const req = request()

    await failureOf(service.enable(req, body))

    expect(req.res.cookie).toHaveBeenCalledTimes(2)
  })

  it('shares its limit with verify and recover', async () => {
    const { service, limiter } = setup({
      mfaEnabled: false,
      factors: [{ id: factorId, status: 'unverified' }],
    })

    await service.enable(request(), body)

    expect(limiter.consume).toHaveBeenCalledWith('mfa', `account:${accountId}`)
  })
})

describe('MfaService.disable', () => {
  it('needs a recent sign-in, before it looks at any factor', async () => {
    const { service, context, mfa } = setup()
    context.signedInWithin.mockReturnValueOnce(false)

    const failure = await failureOf(service.disable(request('aal2')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.reauthentication-required' },
    })
    expect(mfa.listFactors).not.toHaveBeenCalled()
  })

  it('answers 404 mfa.not-enabled for an account with no verified factor', async () => {
    const { service, admin } = setup({ mfaEnabled: false, factors: [] })

    const failure = await failureOf(service.disable(request('aal2')))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 404,
      body: { code: 'mfa.not-enabled' },
    })
    expect(admin.deleteFactor).not.toHaveBeenCalled()
  })

  it('ends the other sessions after the factors are gone', async () => {
    const { service, client, calls } = setup()

    await service.disable(request('aal2'))

    expect(client.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(calls.indexOf('signOut')).toBeGreaterThan(calls.lastIndexOf('deleteFactor'))
  })

  it('removes the factors, drops the unused codes and mails', async () => {
    const { service, calls } = setup()

    await service.disable(request('aal2'))

    expect(calls).toEqual([
      'setSession',
      'listFactors',
      'deleteFactor',
      'signOut',
      'deleteUnused',
      'getSession',
      'sendNoticeEmail',
    ])
  })

  it('still answers when the email fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, mail } = setup()
    mail.sendNoticeEmail.mockRejectedValueOnce(new Error('smtp down'))

    await expect(service.disable(request('aal2'))).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('smtp down')
    expect(String(warn.mock.calls[0]![0])).not.toContain('person@example.test')
  })

  it('ends the other sessions once the factors are gone, and still answers when that fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, client } = setup()
    client.signOut.mockRejectedValueOnce(new Error('gotrue down'))

    await expect(service.disable(request('aal2'))).resolves.toBeUndefined()

    expect(client.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('mails the notice although dropping the codes throws after the factors are gone', async () => {
    const { service, codes, mail } = setup()
    codes.deleteUnused.mockRejectedValueOnce(
      new RecoveryCodeStoreError('deleteUnused', new Error('database down')),
    )

    await failureOf(service.disable(request('aal2')))

    expect(mail.sendNoticeEmail).toHaveBeenCalledTimes(1)
  })
})

describe('MfaService.verify', () => {
  it('verifies the account’s own verified factor and sets the cookies', async () => {
    const { service, mfa } = setup()
    const req = request()

    await service.verify(req, { code: '123456' })

    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId, code: '123456' })
    expect(req.res.cookie).toHaveBeenCalledTimes(2)
  })

  it('writes the cookies of a refreshed session when the code is wrong', async () => {
    const { service, mfa, held } = setup()
    mfa.challengeAndVerify.mockImplementationOnce(() => {
      held.current = session
      return Promise.resolve({
        data: null,
        error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
      }) as never
    })
    const req = request()

    const failure = await failureOf(service.verify(req, { code: '123456' }))

    expect(toErrorResponse(failure)).toMatchObject({ status: 400 })
    expect(req.res.cookie).toHaveBeenCalledTimes(2)
    expect(req.res.clearCookie).not.toHaveBeenCalled()
  })

  it('writes no cookie when the session is the request’s own', async () => {
    const { service, mfa } = setup()
    mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
    } as never)
    const req = request()

    await failureOf(service.verify(req, { code: '123456' }))

    expect(req.res.cookie).not.toHaveBeenCalled()
  })

  it.each([
    ['an account without 2FA', { mfaEnabled: false }, 'aal1'],
    ['a session at aal2', {}, 'aal2'],
    ['an account with no verified factor', { factors: [] }, 'aal1'],
  ] satisfies [string, Parameters<typeof setup>[0], 'aal1' | 'aal2'][])(
    'answers 409 mfa.not-required for %s',
    async (_, options, aal) => {
      const { service, mfa } = setup(options)

      const failure = await failureOf(service.verify(request(aal), { code: '123456' }))

      expect(toErrorResponse(failure)).toMatchObject({
        status: 409,
        body: { code: 'mfa.not-required' },
      })
      expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
    },
  )
})

describe('MfaService.enroll', () => {
  it('removes a stale unverified factor, then enrolls and answers the secret', async () => {
    const { service, calls } = setup({
      mfaEnabled: false,
      factors: [{ id: otherFactorId, status: 'unverified' }],
    })

    const result = await service.enroll(request())

    expect(calls).toEqual(['setSession', 'listFactors', 'unenroll', 'enroll', 'getSession'])
    expect(result).toEqual({
      factorId,
      qrCode: 'data:image/svg+xml;utf8,<svg/>',
      secret: 'JBSWY3DP',
    })
  })

  it('answers 409 mfa.already-enabled for an account with 2FA', async () => {
    const { service, mfa } = setup()

    const failure = await failureOf(service.enroll(request()))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 409,
      body: { code: 'mfa.already-enabled' },
    })
    expect(mfa.enroll).not.toHaveBeenCalled()
  })

  it('needs a recent sign-in', async () => {
    const { service, context } = setup({ mfaEnabled: false })
    context.signedInWithin.mockReturnValueOnce(false)

    const failure = await failureOf(service.enroll(request()))

    expect(toErrorResponse(failure)).toMatchObject({
      status: 401,
      body: { code: 'session.reauthentication-required' },
    })
  })
})
