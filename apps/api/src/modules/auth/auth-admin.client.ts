import { Inject, Injectable, Logger } from '@nestjs/common'
import { GoTrueAdminApi, isAuthRetryableFetchError } from '@supabase/auth-js'
import { unavailable } from '../../common/errors/api-error'
import { authUrl, ENV, type Env } from '../../config/env'

/** How long one admin call may take before the API gives up on it. */
const ADMIN_TIMEOUT_MS = 10_000

/**
 * One call to Supabase Auth, with the two things auth-js loses made visible: it keeps only
 * `e.message` of a transport failure, so the cause (`ECONNREFUSED`, a TLS error) joins the message;
 * and a 5xx outside its own list whose body is not JSON arrives as an error without a status, so
 * it is raised here as a failure that carries the status and counts as an outage.
 */
async function callAuth(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(input, { ...init, signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS) })
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
 * The Supabase Auth admin API, authorized by the secret key on `apikey` alone (PLAN.md 10). The API
 * uses it for account deletion only. Outbound I/O: never call it inside a tenant transaction.
 */
@Injectable()
export class AuthAdminClient {
  private readonly api: GoTrueAdminApi
  private readonly logger = new Logger(AuthAdminClient.name)

  constructor(@Inject(ENV) env: Env) {
    this.api = new GoTrueAdminApi({
      url: authUrl(env),
      headers: { apikey: env.SUPABASE_SECRET_KEY },
      fetch: callAuth,
    })
  }

  /**
   * `DELETE /admin/users/:id`, a hard delete: `accounts` and every row referencing it cascade.
   * `false` when the user was already gone. A transport failure or a 5xx is an outage, answered
   * `503` `server.unavailable`. Any other failure throws an error without a `status`: a 4xx from
   * Supabase Auth refuses the API's key, not the caller, so it is a logged `500`.
   */
  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.api.deleteUser(id, false)
    if (!error) return true
    if (error.status === 404) return false
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      this.logger.warn(
        `Supabase Auth did not take deleteUser: ${error.status ?? 'no status'} ${error.message}`,
      )
      throw unavailable()
    }
    throw new Error(`Supabase Auth refused deleteUser with ${error.status ?? 'no status'}`, {
      cause: error,
    })
  }
}
