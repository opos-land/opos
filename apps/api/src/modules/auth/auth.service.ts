import { randomBytes } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { type Account } from '@opos/contract'
import { detectLocale } from '@opos/i18n'
import { AuthApiError, type GoTrueClient, isAuthError, type Session } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, originDenied, unauthenticated } from '../../common/errors/api-error'
import { type Application, applicationFromOrigin } from '../../common/http/application'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ENV, type Env } from '../../config/env'
import { RECENT_SIGN_IN_SECONDS } from '../accounts/account-deletion.service'
import { AccountsRepository } from '../accounts/accounts.repository'
import { toApiError } from './auth-refusal'
import { SupabaseAuthFactory } from './supabase-auth.factory'
import {
  clearSessionCookies,
  type CookieRequest,
  type CookieResponse,
  readSessionCookies,
  setSessionCookies,
} from './session-cookies'

/** What the service reads of the request and writes to its response. */
export interface AuthRequest extends CookieRequest {
  res: CookieResponse
}

/** Supabase Auth reports a refusal in `error`, and auth-js returns it instead of throwing. */
function unwrap<T>(result: { data: T; error: Error | null }): T {
  if (result.error) throw result.error
  return result.data
}

/** Supabase Auth refuses a sign-up of an address it knows with one of these on some versions. */
const REGISTERED = new Set(['user_already_exists', 'email_exists'])

/**
 * What a refresh token refused means for the session. A cookie whose value is not even a token
 * answers `validation_failed`, and is as dead as one Supabase Auth has forgotten.
 */
const refreshRefusal = (error: unknown) =>
  isAuthError(error) && error.code === 'validation_failed' ? unauthenticated() : toApiError(error)

/**
 * What Supabase Auth refused on a route that takes an address. The contract already refuses a
 * malformed one, so a remaining `validation_failed` is an address Supabase Auth judges otherwise.
 */
const addressRefusal = (error: unknown) =>
  isAuthError(error) && error.code === 'validation_failed'
    ? toApiError(new AuthApiError(error.message, 422, 'email_address_invalid'))
    : toApiError(error)

/**
 * The `auth` endpoints (PLAN.md 5.1): the API calls Supabase Auth for the person and keeps the
 * session in cookies, one pair per application (PLAN.md 7.4). No token reaches a response body.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: SupabaseAuthFactory,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
  ) {}

  /** The calling application is the `Origin`; anything else is refused (PLAN.md 5.1). */
  private application(req: CookieRequest): Application {
    const app = applicationFromOrigin(req.headers.origin, this.env)
    if (!app) throw originDenied()
    return app
  }

  /** The application of a request that spends the shared limit of the six public routes. */
  private async publicRoute(req: CookieRequest): Promise<Application> {
    const app = this.application(req)
    await this.limiter.consume('authentication', `ip:${this.context.clientAddress()}`)
    return app
  }

  /** `<app URL>/auth/confirm`, where the links of the emails lead. */
  private confirmUrl(app: Application) {
    const base = app === 'portal' ? this.env.PORTAL_URL : this.env.PANEL_URL
    return `${new URL(base).origin}/auth/confirm`
  }

  private async accountOf(session: Session): Promise<Account> {
    const account = await this.accounts.findForToken(session.user.id)
    if (!account) throw unauthenticated('No account for this session')
    return account
  }

  /** Sets the cookies of a session just issued and answers the account it belongs to. */
  private async signedIn(
    req: AuthRequest,
    app: Application,
    session: Session | null,
  ): Promise<Account> {
    if (!session) throw new ApiError(500, 'server.error', 'Supabase Auth issued no session')
    const account = await this.accountOf(session)
    setSessionCookies(req.res, app, session, this.env)
    return account
  }

  /**
   * The three routes that mail an address promise to reveal nothing about it (PLAN.md 5.1). An
   * empty mail bucket is a `202` for that reason: Supabase Auth's window per address exists only
   * for an address it knows, and the code cannot tell it from the project's bucket.
   */
  private mailRefused(error: unknown, route: string): void {
    if (isAuthError(error) && error.code === 'over_email_send_rate_limit') {
      this.logger.warn(`Supabase Auth refused a mail for ${route}: over_email_send_rate_limit`)
      return
    }
    throw addressRefusal(error)
  }

  async signUp(
    req: CookieRequest,
    body: { email: string; firstName?: string; lastName?: string },
    acceptLanguage: string | undefined,
  ): Promise<void> {
    const app = await this.publicRoute(req)
    // The person chooses the password after the link proves the address; this one nobody knows.
    const password = randomBytes(32).toString('base64url')
    const { error } = await this.auth.forRequest().signUp({
      email: body.email,
      password,
      options: {
        emailRedirectTo: this.confirmUrl(app),
        data: {
          ...(body.firstName ? { first_name: body.firstName } : {}),
          ...(body.lastName ? { last_name: body.lastName } : {}),
          locale: detectLocale({ acceptLanguage }),
        },
      },
    })
    // The same answer for an address already registered, so the form reveals nothing about it.
    if (error && !(error.code && REGISTERED.has(error.code))) this.mailRefused(error, 'sign-up')
  }

  async resend(req: CookieRequest, email: string): Promise<void> {
    const app = await this.publicRoute(req)
    const { error } = await this.auth.forRequest().resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: this.confirmUrl(app) },
    })
    if (error) this.mailRefused(error, 'resend')
  }

  async forgotPassword(req: CookieRequest, email: string): Promise<void> {
    const app = await this.publicRoute(req)
    const { error } = await this.auth
      .forRequest()
      .resetPasswordForEmail(email, { redirectTo: this.confirmUrl(app) })
    if (error) this.mailRefused(error, 'password reset')
  }

  async verify(
    req: AuthRequest,
    body: { tokenHash: string; type: 'signup' | 'recovery' },
  ): Promise<Account> {
    const app = await this.publicRoute(req)
    const client = this.auth.forRequest()
    const result = await client.verifyOtp({ token_hash: body.tokenHash, type: body.type })
    if (result.error) throw toApiError(result.error)
    if (body.type === 'signup') await this.replacePassword(client)
    return this.signedIn(req, app, result.data.session)
  }

  /**
   * Whoever registered the address first chose its password before the owner confirmed it, so
   * the confirmation replaces it with a random one nobody knows (PLAN.md 5.1). The session the
   * confirmation opened is not handed out while the old password may still work.
   */
  private async replacePassword(client: GoTrueClient): Promise<void> {
    try {
      const { error } = await client.updateUser({ password: randomBytes(32).toString('base64url') })
      if (error) throw error
    } catch (error) {
      this.logger.warn('Could not replace the password of an account at its confirmation')
      throw toApiError(error)
    }
  }

  async signIn(req: AuthRequest, body: { email: string; password: string }): Promise<Account> {
    const app = await this.publicRoute(req)
    const result = await this.auth.forRequest().signInWithPassword(body)
    if (result.error) throw toApiError(result.error)
    return this.signedIn(req, app, result.data.session)
  }

  /**
   * Rotates the pair. Only a dead session ends the browser's: `session.invalid` clears the
   * cookies, an outage or any other refusal keeps them (PLAN.md 5.1).
   */
  async refresh(req: AuthRequest): Promise<void> {
    const app = this.application(req)
    try {
      const { refresh } = readSessionCookies(req, app)
      if (!refresh) throw unauthenticated('No refresh cookie')
      const { session } = unwrap(
        await this.auth.forRequest().refreshSession({ refresh_token: refresh }),
      )
      if (!session) throw new ApiError(500, 'server.error', 'Supabase Auth issued no session')
      setSessionCookies(req.res, app, session, this.env)
    } catch (error) {
      const refusal = refreshRefusal(error)
      if (refusal.code === 'session.invalid') clearSessionCookies(req.res, app, this.env)
      throw refusal
    }
  }

  /**
   * Ends this session only. With the refresh cookie alone, refreshes first for the access token
   * `signOut` needs. The cookies go whatever Supabase Auth answers: the person is signed out here.
   */
  async signOut(req: AuthRequest): Promise<void> {
    const app = this.application(req)
    const { access, refresh } = readSessionCookies(req, app)
    try {
      const client = this.auth.forRequest()
      let token = access
      if (!token && refresh) {
        token = unwrap(await client.refreshSession({ refresh_token: refresh })).session
          ?.access_token
      }
      if (token) unwrap(await client.admin.signOut(token, 'local'))
    } catch (error) {
      const refusal = refreshRefusal(error)
      if (refusal.code !== 'session.invalid') {
        this.logger.warn(`Sign-out did not reach Supabase Auth: ${refusal.message}`)
      }
    } finally {
      clearSessionCookies(req.res, app, this.env)
    }
  }

  /**
   * Sets the password of the signed-in account and ends every other session. A `same_password`
   * refusal still ends them, so a retry after a failed sign-out completes the change.
   */
  async changePassword(req: AuthRequest, password: string): Promise<void> {
    const app = this.application(req)
    if (!this.context.signedInWithin(RECENT_SIGN_IN_SECONDS)) {
      throw new ApiError(
        401,
        'session.reauthentication-required',
        'Changing the password needs a sign-in from the last 5 minutes',
      )
    }
    const { access, refresh } = readSessionCookies(req, app)
    if (!access || !refresh) throw unauthenticated('No session cookies')

    const client = this.auth.forRequest()
    try {
      unwrap(await client.setSession({ access_token: access, refresh_token: refresh }))
      const { error } = await client.updateUser({ password })
      if (error && error.code !== 'same_password') throw error
      const { error: othersError } = await client.signOut({ scope: 'others' })
      if (othersError) throw othersError
      if (error) throw error
    } catch (error) {
      const refusal = toApiError(error)
      if (refusal.code === 'session.invalid') clearSessionCookies(req.res, app, this.env)
      throw refusal
    }
  }
}
