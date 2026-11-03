import { Inject, Injectable, Logger } from '@nestjs/common'
import { type MfaCodeBody } from '@opos/contract'
import { mfaDisabledEmail } from '@opos/i18n/emails'
import { type Factor } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound, originDenied, unauthenticated } from '../../common/errors/api-error'
import { isAal2 } from '../../common/guards/access-token'
import { type Application, applicationFromOrigin } from '../../common/http/application'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ENV, type Env } from '../../config/env'
import { RECENT_SIGN_IN_SECONDS } from '../accounts/account-deletion.service'
import { MailService } from '../mail/mail.service'
import { recipientLocale } from '../mail/recipient-locale'
import { AuthAdminClient } from './auth-admin.client'
import { toApiError } from './auth-refusal'
import { unwrap, type AuthRequest } from './auth.service'
import { hashRecoveryCode, newRecoveryCodes } from './recovery-code'
import { RecoveryCodesRepository } from './recovery-codes.repository'
import { clearSessionCookies, readSessionCookies, setSessionCookies } from './session-cookies'
import { SupabaseAuthFactory } from './supabase-auth.factory'

/** The data of a Supabase Auth answer, which holds none only when it reported an error. */
function data<T>(result: { data: T | null; error: Error | null }): T {
  const value = unwrap(result)
  if (value === null) throw new ApiError(500, 'server.error', 'Supabase Auth answered with no data')
  return value
}

const alreadyEnabled = () =>
  new ApiError(409, 'mfa.already-enabled', 'Two-factor authentication is already on')

const notRequired = () =>
  new ApiError(409, 'mfa.not-required', 'The session needs no code of two-factor authentication')

const notEnabled = () => new ApiError(404, 'mfa.not-enabled', 'Two-factor authentication is not on')

const codeInvalid = () => new ApiError(400, 'mfa.code-invalid', 'The code is wrong or has expired.')

const reauthenticate = (what: string) =>
  new ApiError(
    401,
    'session.reauthentication-required',
    `${what} needs a sign-in from the last 5 minutes`,
  )

/**
 * Two-factor authentication (PLAN.md 7.12): TOTP on Supabase Auth's factors. The factors always
 * come from the session's own `listFactors`, never from the browser alone. No code, secret or
 * recovery code is ever logged or put into an error.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name)

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: SupabaseAuthFactory,
    private readonly admin: AuthAdminClient,
    private readonly codes: RecoveryCodesRepository,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
    private readonly mail: MailService,
  ) {}

  /** The calling application is the `Origin`; anything else is refused (PLAN.md 5.1). */
  private application(req: AuthRequest): Application {
    const app = applicationFromOrigin(req.headers.origin, this.env)
    if (!app) throw originDenied()
    return app
  }

  /**
   * The session of the request as a Supabase Auth client. A token the gateway refreshed on the way
   * (one close to its end) replaces the browser's cookies, since its refresh token is spent.
   */
  private async sessionClient(req: AuthRequest, app: Application) {
    const { access, refresh } = readSessionCookies(req, app)
    if (!access || !refresh) throw unauthenticated('No session cookies')
    const client = this.auth.forRequest()
    const { session } = unwrap(
      await client.setSession({ access_token: access, refresh_token: refresh }),
    )
    if (session && session.access_token !== access) {
      setSessionCookies(req.res, app, session, this.env)
    }
    return { client, access }
  }

  /** What went wrong, as the answer; a session Supabase Auth no longer knows loses its cookies. */
  private refusal(error: unknown, req: AuthRequest, app: Application): ApiError {
    const refusal = toApiError(error)
    if (refusal.code === 'session.invalid') clearSessionCookies(req.res, app, this.env)
    return refusal
  }

  private requireRecentSignIn(what: string) {
    if (!this.context.signedInWithin(RECENT_SIGN_IN_SECONDS)) throw reauthenticate(what)
  }

  /** The shared limit of `verify`, `recover` and `enable`, per account (PLAN.md 7.9). */
  private attempt() {
    return this.limiter.consume('mfa', `account:${this.context.account().id}`)
  }

  /** Removes every factor of the account through the admin API, a factor already gone included. */
  private async removeFactors(factors: Pick<Factor, 'id'>[]) {
    const { id } = this.context.account()
    for (const factor of factors) await this.admin.deleteFactor(id, factor.id)
  }

  /** The notice that 2FA is off; a failure is logged and the removal stands (PLAN.md 7.12). */
  private async notifyDisabled() {
    const { email, locale } = this.context.account()
    try {
      await this.mail.sendNoticeEmail({
        to: email,
        locale: recipientLocale({ account: locale }),
        content: mfaDisabledEmail,
      })
    } catch (error) {
      this.logger.warn(
        `The notice that two-factor authentication was turned off was not sent: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
  }

  /** Starts enrolling an authenticator app: a stale unverified factor goes, a new one comes. */
  async enroll(req: AuthRequest) {
    const app = this.application(req)
    this.requireRecentSignIn('Turning on two-factor authentication')
    if (this.context.account().mfaEnabled) throw alreadyEnabled()
    try {
      const { client } = await this.sessionClient(req, app)
      const { all } = data(await client.mfa.listFactors())
      if (all.some((factor) => factor.status === 'verified')) throw alreadyEnabled()
      for (const factor of all) data(await client.mfa.unenroll({ factorId: factor.id }))
      const enrolled = data(await client.mfa.enroll({ factorType: 'totp', issuer: 'OPOS' }))
      return {
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      }
    } catch (error) {
      throw this.refusal(error, req, app)
    }
  }

  /**
   * Verifies the enrolled factor and turns 2FA on. The recovery codes are stored before the factor
   * is verified, so an account never holds a verified factor and no codes; a wrong code leaves
   * codes nobody has seen, which the next `enable` replaces.
   */
  async enable(req: AuthRequest, body: { factorId: string; code: string }) {
    const app = this.application(req)
    await this.attempt()
    if (this.context.account().mfaEnabled) throw alreadyEnabled()
    try {
      const { client } = await this.sessionClient(req, app)
      const { all } = data(await client.mfa.listFactors())
      if (all.some((factor) => factor.status === 'verified')) throw alreadyEnabled()
      if (!all.some((factor) => factor.id === body.factorId)) throw notFound('factor')

      const recoveryCodes = newRecoveryCodes()
      await this.codes.replaceUnused(recoveryCodes.map(hashRecoveryCode))
      const verified = data(
        await client.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code }),
      )
      setSessionCookies(req.res, app, verified, this.env)
      return { recoveryCodes }
    } catch (error) {
      throw this.refusal(error, req, app)
    }
  }

  /** Raises an `aal1` session to `aal2` with the account's own verified factor. */
  async verify(req: AuthRequest, body: MfaCodeBody): Promise<void> {
    const app = this.application(req)
    await this.attempt()
    if (!this.context.account().mfaEnabled) throw notRequired()
    try {
      const { client, access } = await this.sessionClient(req, app)
      if (isAal2(access)) throw notRequired()
      const { all } = data(await client.mfa.listFactors())
      const factor = all.find((candidate) => candidate.status === 'verified')
      if (!factor) throw notRequired()
      const verified = data(
        await client.mfa.challengeAndVerify({ factorId: factor.id, code: body.code }),
      )
      setSessionCookies(req.res, app, verified, this.env)
    } catch (error) {
      throw this.refusal(error, req, app)
    }
  }

  /**
   * Turns 2FA off with a recovery code. The factors go first and the code is spent only after,
   * so a failed removal spends nothing; a failed email after the removal is logged only.
   */
  async recover(req: AuthRequest, body: { code: string }): Promise<void> {
    const app = this.application(req)
    await this.attempt()
    if (!this.context.account().mfaEnabled) throw notRequired()
    const hash = hashRecoveryCode(body.code)
    try {
      const { client, access } = await this.sessionClient(req, app)
      if (isAal2(access)) throw notRequired()
      if (!(await this.codes.hasUnused(hash))) throw codeInvalid()
      const { all } = data(await client.mfa.listFactors())
      await this.removeFactors(all)
      // Spent by a request that came in between: its answer is the one that counts.
      if (!(await this.codes.markUsed(hash))) throw codeInvalid()
      await this.codes.deleteUnused()
    } catch (error) {
      throw this.refusal(error, req, app)
    }
    await this.notifyDisabled()
  }

  /** `DELETE /auth/mfa`: at `aal2` (the guard) and within 5 minutes of a sign-in. */
  async disable(req: AuthRequest): Promise<void> {
    const app = this.application(req)
    this.requireRecentSignIn('Turning off two-factor authentication')
    try {
      const { client } = await this.sessionClient(req, app)
      const { all } = data(await client.mfa.listFactors())
      if (!all.some((factor) => factor.status === 'verified')) throw notEnabled()
      await this.removeFactors(all)
      await this.codes.deleteUnused()
    } catch (error) {
      throw this.refusal(error, req, app)
    }
    await this.notifyDisabled()
  }
}
