import { Inject, Injectable, Logger } from '@nestjs/common'
import { applicationSchema, type ErrorCode } from '@opos/contract'
import { isAuthError, type SupportedStorage } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError } from '../../common/errors/api-error'
import { isAal2 } from '../../common/guards/access-token'
import {
  type Application,
  type ApplicationUrls,
  applicationUrl,
} from '../../common/http/application'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ENV, type Env } from '../../config/env'
import { AccountsRepository } from '../accounts/accounts.repository'
import {
  type CookieRequest,
  type CookieResponse,
  parseCookies,
  setSessionCookies,
} from './session-cookies'
import { GOOGLE_STORAGE_KEY, SupabaseAuthFactory } from './supabase-auth.factory'

/** The cookie that carries a Google sign-in from its start to its callback. */
export const GOOGLE_COOKIE = 'opos_google'
/** How long a Google sign-in may take from its start to its callback. */
export const GOOGLE_FLOW_MS = 10 * 60 * 1000
/** The cookie outlives the flow: a late callback still knows the application to return to. */
export const GOOGLE_COOKIE_MAX_AGE_MS = 60 * 60 * 1000
const GOOGLE_COOKIE_PATH = '/auth/google'

/** What the cookie holds; `expiresAt` is in milliseconds since the epoch. */
export interface GoogleFlow {
  verifier: string
  app: Application
  path: string
  expiresAt: number
}

/** A PKCE verifier is 43 to 128 characters of the unreserved set (RFC 7636). */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

/** The admin application offers no Google sign-in, so a flow never names it; the portal stands in. */
const applicationOrigin = (app: Application, env: ApplicationUrls) =>
  new URL(applicationUrl(app, env) ?? env.PORTAL_URL).origin

/**
 * The login page of `app`, which shows the code of a Google sign-in that did not go through, with
 * the path of the flow when one is known, for the way back of a person who is still signed in. The
 * application's `safeRedirect` decides what it follows.
 */
export const googleFailureUrl = (
  app: Application,
  code: ErrorCode,
  env: ApplicationUrls,
  path?: string,
) =>
  `${applicationOrigin(app, env)}/login?error=${code}${
    path === undefined ? '' : `&redirect=${encodeURIComponent(path)}`
  }`

/**
 * The path of `app` a Google sign-in returns to. `redirect` counts only as a path:
 * it starts with a single `/`, holds no backslash or control character, and still resolves to the
 * application's own origin with a path that starts with a single `/`; anything else is the start page, `/`.
 */
export function returnPath(app: Application, redirect: unknown, env: ApplicationUrls): string {
  if (typeof redirect !== 'string' || !redirect.startsWith('/')) return '/'
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(redirect)) return '/'
  const origin = applicationOrigin(app, env)
  try {
    const url = new URL(redirect, origin)
    // Dot segments collapse during resolution and can leave a path that opens with `//`.
    if (url.origin !== origin || url.pathname.startsWith('//')) return '/'
    return `${url.pathname}${url.search}`
  } catch {
    return '/'
  }
}

/** The value of `opos_google`: the flow in JSON, valid for 10 minutes from `now`. */
export const googleCookieValue = (
  flow: Pick<GoogleFlow, 'verifier' | 'app' | 'path'>,
  now = Date.now(),
): string => JSON.stringify({ ...flow, expiresAt: now + GOOGLE_FLOW_MS })

/** Whether the 10 minutes of the flow are over. */
export const googleFlowExpired = (flow: Pick<GoogleFlow, 'expiresAt'>, now = Date.now()) =>
  flow.expiresAt <= now

/**
 * The flow a cookie value holds, or nothing when it is absent or malformed; an expired one is
 * still read, since its application is where the visitor returns to log in. The cookie is not
 * signed, so the callback trusts none of it: the code binds to the verifier, and the application
 * and the path are judged again.
 */
export function parseGoogleCookie(value: string | undefined): GoogleFlow | null {
  if (value === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { verifier, app, path, expiresAt } = parsed as Record<string, unknown>
  const application = applicationSchema.safeParse(app)
  if (
    typeof verifier !== 'string' ||
    !VERIFIER.test(verifier) ||
    !application.success ||
    typeof path !== 'string' ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return null
  }
  return { verifier, app: application.data, path, expiresAt }
}

const GOOGLE_FAILED = 'auth.google-failed' satisfies ErrorCode

/**
 * The `error=` code of the login page for an `error_code` Supabase Auth appended to the callback:
 * `auth.over_request_rate_limit` for its request limit, `auth.google-failed` for anything else,
 * `otp_expired` included, whose message speaks of a link from an email. The query is the visitor's
 * to write, so no other text of it reaches a Location.
 */
export function failureCode(errorCode: unknown): ErrorCode {
  return errorCode === 'over_request_rate_limit' ? 'auth.over_request_rate_limit' : GOOGLE_FAILED
}

/** A short machine code such as `flow_state_not_found`; anything else is not worth a log line. */
const LOGGABLE_CODE = /^[a-z0-9_]{1,64}$/

/**
 * Which refusal this is, for a log: the code and the status, never the message, which may quote
 * the address, the verifier or the auth code that was sent.
 */
function describeFailure(error: unknown): string {
  if (isAuthError(error)) {
    const code = typeof error.code === 'string' && LOGGABLE_CODE.test(error.code) ? error.code : '-'
    return `${error.name} code=${code} status=${error.status ?? '-'}`
  }
  return error instanceof Error ? error.name : 'unknown failure'
}

/** A storage that lives as long as the request: auth-js writes its verifier here. */
const requestStorage = (items: Map<string, string>): SupportedStorage => ({
  getItem: (key) => items.get(key) ?? null,
  setItem: (key, value) => void items.set(key, value),
  removeItem: (key) => void items.delete(key),
})

/** What the two routes read of the request: the `Cookie` header and the response to write. */
export interface GoogleRequest extends CookieRequest {
  res: CookieResponse
}

/**
 * Google sign-in with PKCE: the API is the OAuth client of Supabase Auth, and the
 * verifier waits between the two requests in the `opos_google` cookie, never in a body, a log or
 * a Location.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name)

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: SupabaseAuthFactory,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
  ) {}

  private cookieAttributes() {
    return {
      httpOnly: true as const,
      sameSite: 'lax' as const,
      path: GOOGLE_COOKIE_PATH,
      secure: new URL(this.env.API_URL).protocol === 'https:',
    }
  }

  /** The address `GET /auth/google` redirects to; sets `opos_google`. */
  async start(query: { app?: unknown; redirect?: unknown }, res: CookieResponse): Promise<string> {
    const app = applicationSchema.safeParse(query.app)
    if (!app.success) {
      throw new ApiError(400, 'request.invalid', 'The query names no application: portal or panel')
    }
    await this.limiter.consume('authentication', `ip:${this.context.clientAddress()}`)

    const items = new Map<string, string>()
    const { data, error } = await this.auth.forGoogle(requestStorage(items)).signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${this.env.API_URL.replace(/\/+$/, '')}/auth/google/callback`,
        skipBrowserRedirect: true,
      },
    })
    const stored = items.get(`${GOOGLE_STORAGE_KEY}-code-verifier`)
    const verifier = stored === undefined ? undefined : (JSON.parse(stored) as unknown)
    if (error || !data.url || typeof verifier !== 'string') {
      this.logger.warn(
        `Google sign-in could not be started: ${error ? describeFailure(error) : 'no address or verifier'}`,
      )
      throw new ApiError(500, 'server.error', 'Google sign-in could not be started')
    }

    res.cookie(
      GOOGLE_COOKIE,
      googleCookieValue({
        verifier,
        app: app.data,
        path: returnPath(app.data, query.redirect, this.env),
      }),
      { ...this.cookieAttributes(), maxAge: GOOGLE_COOKIE_MAX_AGE_MS },
    )
    return data.url
  }

  /**
   * The address `GET /auth/google/callback` redirects to. The cookie goes whatever happens, and
   * every refusal is one redirect to a login page: a missing, expired or foreign cookie, an
   * `error` of Supabase Auth, a refused exchange.
   */
  async callback(
    query: { code?: unknown; error?: unknown; error_code?: unknown },
    req: GoogleRequest,
  ): Promise<string> {
    const header = req.headers.cookie
    const raw = typeof header === 'string' ? parseCookies(header).get(GOOGLE_COOKIE) : undefined
    req.res.clearCookie(GOOGLE_COOKIE, this.cookieAttributes())

    const flow = parseGoogleCookie(raw)
    if (!flow) return googleFailureUrl('portal', GOOGLE_FAILED, this.env)
    // The cookie is the visitor's to write, so its path counts only once judged again.
    const path = returnPath(flow.app, flow.path, this.env)
    const failure = (code: ErrorCode = GOOGLE_FAILED) =>
      googleFailureUrl(flow.app, code, this.env, path)
    if (googleFlowExpired(flow)) return failure()
    if (query.error !== undefined) {
      const sent = typeof query.error_code === 'string' ? query.error_code : ''
      this.logger.warn(
        `Supabase Auth sent Google sign-in back with error_code=${LOGGABLE_CODE.test(sent) ? sent : '-'}`,
      )
      return failure(failureCode(query.error_code))
    }
    if (typeof query.code !== 'string' || query.code === '') return failure()

    const items = new Map([[`${GOOGLE_STORAGE_KEY}-code-verifier`, JSON.stringify(flow.verifier)]])
    let mfaPending: boolean
    try {
      const { data, error } = await this.auth
        .forGoogle(requestStorage(items))
        .exchangeCodeForSession(query.code)
      if (error) throw error
      const account = await this.accounts.findForToken(data.session.user.id)
      if (!account) throw new Error('no account for the session')
      setSessionCookies(req.res, flow.app, data.session, this.env)
      mfaPending = account.mfaEnabled && !isAal2(data.session.access_token)
    } catch (error) {
      // The code and the status only: the message of a refusal may quote what was sent.
      this.logger.warn(`Google sign-in failed: ${describeFailure(error)}`)
      return failure()
    }
    const origin = applicationOrigin(flow.app, this.env)
    // The session starts at aal1 on an account with 2FA: the code screen finishes it.
    return mfaPending
      ? `${origin}/auth/mfa?redirect=${encodeURIComponent(path)}`
      : `${origin}${path}`
  }
}
