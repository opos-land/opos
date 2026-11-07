import { Inject, Injectable } from '@nestjs/common'
import { GoTrueAdminApi, GoTrueClient, type SupportedStorage } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { authUrl, ENV, type Env } from '../../config/env'

/** How long one call may take before the API gives up on it. */
const AUTH_TIMEOUT_MS = 10_000

/**
 * auth-js treats every 5xx up to 530, and any thrown transport failure, as retryable, and a refresh
 * retries those with a backoff for about 25 seconds. An outage has to answer at once, so it comes
 * back as a response with a status outside that list: an `AuthApiError` whose status (>= 500)
 * tells `toApiError` it is an outage.
 */
const OUTAGE_STATUS = 599

/**
 * The `code` of an outage Supabase Auth did not answer itself: a transport failure, the timeout, or
 * a `5xx` without its code, which is a gateway answering for a service that is down.
 */
export const NO_AUTH_ANSWER = 'no_auth_answer'

const outage = (message: string, errorCode: string) =>
  new Response(JSON.stringify({ error_code: errorCode, msg: message }), {
    status: OUTAGE_STATUS,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Supabase Auth's own code in the JSON body of an answer, read as auth-js reads it: `code` on the
 * API version auth-js asks for, which the answer echoes in a header, and `error_code` otherwise.
 */
function authCodeOf(response: Response, body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const { code, error_code: errorCode } = body as { code?: unknown; error_code?: unknown }
  const own = response.headers.has('x-supabase-api-version') ? code : errorCode
  return typeof own === 'string' && own !== '' ? own : undefined
}

/**
 * The key prefix of the Google client's storage. The callback seeds the verifier from the cookie
 * under `<this>-code-verifier`, where auth-js looks when the redirect names no flow.
 */
export const GOOGLE_STORAGE_KEY = 'opos-google'

/**
 * One call to Supabase Auth, with the two things auth-js loses made visible: it keeps only
 * `e.message` of a transport failure, so the cause (`ECONNREFUSED`, a TLS error) joins the message;
 * and a 5xx whose body is not JSON arrives as an error without a status. Both, and every other
 * 5xx, come back as an `outage`, which keeps the code of a 5xx Supabase Auth answered itself. The
 * client's full address goes along in `Sb-Forwarded-For`; the visitor's `User-Agent`
 * never does.
 */
async function callAuth(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const clientIp = TenantContextService.peek()?.clientIp
  if (clientIp) headers.set('Sb-Forwarded-For', clientIp)

  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers,
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    if (error instanceof Error && cause instanceof Error) {
      return outage(`${error.message}: ${cause.message}`, NO_AUTH_ANSWER)
    }
    return outage(error instanceof Error ? error.message : String(error), NO_AUTH_ANSWER)
  }
  if (response.status >= 500) {
    const http = `HTTP ${response.status}`
    const read = await response
      .clone()
      .json()
      .then(
        (body: unknown) => ({ code: authCodeOf(response, body) }),
        () => undefined,
      )
    if (!read) return outage(`${http} with a body that is not JSON`, NO_AUTH_ANSWER)
    return read.code ? outage(`${http} ${read.code}`, read.code) : outage(http, NO_AUTH_ANSWER)
  }
  return response
}

/**
 * The API's Supabase Auth clients, each made per request so nothing of one request's
 * session reaches another. All authorize with the secret key on `apikey` alone and never refresh
 * on their own.
 */
@Injectable()
export class SupabaseAuthFactory {
  private readonly url: string
  private readonly headers: Record<string, string>

  constructor(@Inject(ENV) env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>) {
    this.url = authUrl(env)
    this.headers = { apikey: env.SUPABASE_SECRET_KEY }
  }

  /** Every call but those of Google sign-in: implicit flow, a session kept nowhere. */
  forRequest(): GoTrueClient {
    return new GoTrueClient({
      url: this.url,
      headers: this.headers,
      fetch: callAuth,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    })
  }

  /**
   * The two requests of Google sign-in: PKCE, with the verifier written to `storage`, which lives
   * as long as the request. auth-js ignores `storage` while `persistSession` is false.
   */
  forGoogle(storage: SupportedStorage): GoTrueClient {
    return new GoTrueClient({
      url: this.url,
      headers: this.headers,
      fetch: callAuth,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      storage,
      storageKey: GOOGLE_STORAGE_KEY,
    })
  }

  /** The admin API, on the secret key alone. */
  admin(): GoTrueAdminApi {
    return new GoTrueAdminApi({ url: this.url, headers: this.headers, fetch: callAuth })
  }
}
