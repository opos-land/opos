import { Inject, Injectable, Logger } from '@nestjs/common'
import { type MfaCodeBody } from '@opos/contract'
import { mfaDisabledEmail } from '@opos/i18n/emails'
import { type Factor, type GoTrueClient } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound, originDenied, unauthenticated } from '../../common/errors/api-error'
import { isAal2 } from '../../common/guards/access-token'
import { type Application, applicationFromOrigin } from '../../common/http/application'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ENV, type Env } from '../../config/env'
import { RECENT_SIGN_IN_SECONDS } from '../accounts/account-deletion.service'
import { MailService } from '../mail/mail.service'
import { AuthAdminClient } from './auth-admin.client'
import { toApiError } from './auth-refusal'
import { unwrap, type AuthRequest } from './auth.service'
import { hashRecoveryCode, newRecoveryCodes } from './recovery-code'
import { RecoveryCodesRepository, RecoveryCodeStoreError } from './recovery-codes.repository'
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
   * Runs `work` on a Supabase Auth client that holds the session of the request. Whatever happens,
   * the session the client ends with replaces the browser's cookies when its access token is not
   * the request's: a refresh inside the client spends the refresh token the browser holds, and a
   * wrong code must not leave the browser with a spent one. A session Supabase Auth no longer
   * knows loses its cookies instead. A failure of the code store is not an answer of Supabase Auth
   * and passes as it is.
   */
  private async withSession<T>(
    req: AuthRequest,
    app: Application,
    work: (client: GoTrueClient, access: string) => Promise<T>,
  ): Promise<T> {
    const { access, refresh } = readSessionCookies(req, app)
    if (!access || !refresh) throw unauthenticated('No session cookies')
    const client = this.auth.forRequest()
    try {
      unwrap(await client.setSession({ access_token: access, refresh_token: refresh }))
      const result = await work(client, access)
      await this.keepSession(client, req, app, access)
      return result
    } catch (error) {
      if (error instanceof RecoveryCodeStoreError) {
        await this.keepSession(client, req, app, access)
        throw error
      }
      const refusal = toApiError(error)
      if (refusal.code === 'session.invalid') clearSessionCookies(req.res, app, this.env)
      else await this.keepSession(client, req, app, access)
      throw refusal
    }
  }

  /** Writes the cookies of the client's session when it is not the one the request came with. */
  private async keepSession(
    client: GoTrueClient,
    req: AuthRequest,
    app: Application,
    requestAccess: string,
  ) {
    try {
      const { data } = await client.getSession()
      if (data.session && data.session.access_token !== requestAccess) {
        setSessionCookies(req.res, app, data.session, this.env)
      }
    } catch {
      // The session could not be read back: the answer is the failure that was already on its way.
    }
  }

  /**
   * Ends every session of the account but this one, once its factors are gone (PLAN.md 7.12): a
   * session at `aal2` from before the removal would otherwise keep that claim against a factor
   * enabled later. A failure is logged and does not undo the removal.
   */
  private async endOtherSessions(client: GoTrueClient) {
    try {
      const { error } = await client.signOut({ scope: 'others' })
      if (error) throw error
    } catch (error) {
      this.logger.warn(
        `The other sessions were not ended after two-factor authentication was removed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
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
    const account = this.context.account()
    try {
      await this.mail.sendNoticeEmail({
        to: account.email,
        locale: await this.admin.noticeLocale(account),
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
    return this.withSession(req, app, async (client) => {
      const { all } = data(await client.mfa.listFactors())
      if (all.some((factor) => factor.status === 'verified')) throw alreadyEnabled()
      for (const factor of all) data(await client.mfa.unenroll({ factorId: factor.id }))
      const enrolled = data(await client.mfa.enroll({ factorType: 'totp', issuer: 'OPOS' }))
      return {
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      }
    })
  }

  /**
   * Verifies the enrolled factor and turns 2FA on. The recovery codes are stored before the factor
   * is verified, so a failed store leaves nothing verified and a retry works, whereas verifying
   * first would leave a verified factor with no codes and a `409` on the retry. A wrong code leaves
   * codes nobody has seen, unusable because `recover` needs the mirror on and replaced by the next
   * `enable`. When the answer never arrives the factor is verified and the codes are held by
   * nobody: the way out is PLAN.md 7.12's, `DELETE /auth/mfa` and a new enrolment. Two requests
   * that race each replace the other's codes, so the codes are read back once the factor is
   * verified, and a request whose codes are gone answers `409` instead of codes that do not exist.
   */
  async enable(req: AuthRequest, body: { factorId: string; code: string }) {
    const app = this.application(req)
    await this.attempt()
    if (this.context.account().mfaEnabled) throw alreadyEnabled()
    return this.withSession(req, app, async (client) => {
      const { all } = data(await client.mfa.listFactors())
      if (all.some((factor) => factor.status === 'verified')) throw alreadyEnabled()
      if (!all.some((factor) => factor.id === body.factorId)) throw notFound('factor')

      const recoveryCodes = newRecoveryCodes()
      const hashes = recoveryCodes.map(hashRecoveryCode)
      if (!(await this.codes.replaceUnused(hashes))) throw alreadyEnabled()
      data(await client.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code }))
      if (!(await this.codes.holdsUnused(hashes))) throw alreadyEnabled()
      return { recoveryCodes }
    })
  }

  /** Raises an `aal1` session to `aal2` with the account's own verified factor. */
  async verify(req: AuthRequest, body: MfaCodeBody): Promise<void> {
    const app = this.application(req)
    await this.attempt()
    if (!this.context.account().mfaEnabled) throw notRequired()
    await this.withSession(req, app, async (client, access) => {
      if (isAal2(access)) throw notRequired()
      const { all } = data(await client.mfa.listFactors())
      const factor = all.find((candidate) => candidate.status === 'verified')
      if (!factor) throw notRequired()
      data(await client.mfa.challengeAndVerify({ factorId: factor.id, code: body.code }))
    })
  }

  /**
   * Turns 2FA off with a recovery code. The factors go first and the code is spent only after,
   * so a failed removal spends nothing. Once the factors are gone the other sessions end and the
   * notice goes out whatever fails after that, a failed email included, which is logged only.
   */
  async recover(req: AuthRequest, body: { code: string }): Promise<void> {
    const app = this.application(req)
    await this.attempt()
    if (!this.context.account().mfaEnabled) throw notRequired()
    const hash = hashRecoveryCode(body.code)
    let removed = false
    let spentElsewhere = false
    try {
      await this.withSession(req, app, async (client, access) => {
        if (isAal2(access)) throw notRequired()
        if (!(await this.codes.hasUnused(hash))) throw codeInvalid()
        const { all } = data(await client.mfa.listFactors())
        await this.removeFactors(all)
        removed = true
        await this.endOtherSessions(client)
        // Spent by a request that came in between: its answer is the one that counts.
        if (!(await this.codes.markUsed(hash))) {
          spentElsewhere = true
          throw codeInvalid()
        }
        await this.codes.deleteUnused()
      })
    } finally {
      if (removed && !spentElsewhere) await this.notifyDisabled()
    }
  }

  /** `DELETE /auth/mfa`: at `aal2` (the guard) and within 5 minutes of a sign-in. */
  async disable(req: AuthRequest): Promise<void> {
    const app = this.application(req)
    this.requireRecentSignIn('Turning off two-factor authentication')
    let removed = false
    try {
      await this.withSession(req, app, async (client) => {
        const { all } = data(await client.mfa.listFactors())
        if (!all.some((factor) => factor.status === 'verified')) throw notEnabled()
        await this.removeFactors(all)
        removed = true
        await this.endOtherSessions(client)
        await this.codes.deleteUnused()
      })
    } finally {
      if (removed) await this.notifyDisabled()
    }
  }
}
