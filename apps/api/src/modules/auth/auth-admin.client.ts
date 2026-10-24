import { Inject, Injectable } from '@nestjs/common'
import { GoTrueAdminApi } from '@supabase/auth-js'
import { ENV, type Env } from '../../config/env'

/** How long one admin call may take before the API gives up on it. */
const ADMIN_TIMEOUT_MS = 10_000

/**
 * The Supabase Auth admin API, authorized with SUPABASE_SERVICE_ROLE_KEY (PLAN.md 10). The API
 * uses it for account deletion only. Outbound I/O: never call it inside a tenant transaction.
 */
@Injectable()
export class AuthAdminClient {
  private readonly api: GoTrueAdminApi

  constructor(@Inject(ENV) env: Env) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    this.api = new GoTrueAdminApi({
      url: env.AUTH_URL,
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS) }),
    })
  }

  /**
   * `DELETE /admin/users/:id`, a hard delete: `accounts` and every row referencing it cascade.
   * `false` when the user was already gone; any other failure throws.
   */
  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.api.deleteUser(id, false)
    if (!error) return true
    if (error.status === 404) return false
    throw error
  }
}
