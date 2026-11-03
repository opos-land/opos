import { Inject, Injectable } from '@nestjs/common'
import { GoTrueAdminApi, GoTrueClient, type SupportedStorage } from '@supabase/auth-js'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { authUrl, ENV, type Env } from '../../config/env'

/** How long one call may take before the API gives up on it. */
const AUTH_TIMEOUT_MS = 10_000

/**
 * One call to Supabase Auth, with the two things auth-js loses made visible: it keeps only
 * `e.message` of a transport failure, so the cause (`ECONNREFUSED`, a TLS error) joins the message;
 * and a 5xx outside its own list whose body is not JSON arrives as an error without a status, so
 * it is raised here as a failure that carries the status and counts as an outage. The client's
 * full address goes along in `Sb-Forwarded-For` (PLAN.md 10); the visitor's `User-Agent` never does.
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
      throw new Error(`${error.message}: ${cause.message}`, { cause: error })
    }
    throw error
  }
  if (response.status >= 500) {
    const isJson = await response
      .clone()
      .json()
      .then(
        () => true,
        () => false,
      )
    if (!isJson) throw new Error(`HTTP ${response.status} with a body that is not JSON`)
  }
  return response
}

/**
 * The API's Supabase Auth clients (PLAN.md 10), each made per request so nothing of one request's
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
    })
  }

  /** The admin API, on the secret key alone. */
  admin(): GoTrueAdminApi {
    return new GoTrueAdminApi({ url: this.url, headers: this.headers, fetch: callAuth })
  }
}
