import { Injectable, Logger } from '@nestjs/common'
import { isLocale, type Locale } from '@opos/i18n'
import { type AuthError, type GoTrueAdminApi, isAuthRetryableFetchError } from '@supabase/auth-js'
import { unavailable } from '../../common/errors/api-error'
import { recipientLocale } from '../mail/recipient-locale'
import { SupabaseAuthFactory } from './supabase-auth.factory'

/**
 * The Supabase Auth admin API, authorized by the secret key on `apikey` alone (PLAN.md 10). The API
 * uses it for account deletion, factor removal, a password a confirmation could not replace and
 * the locale of a notice. Outbound I/O: never call it inside a tenant transaction.
 */
@Injectable()
export class AuthAdminClient {
  private readonly api: GoTrueAdminApi
  private readonly logger = new Logger(AuthAdminClient.name)

  constructor(factory: SupabaseAuthFactory) {
    this.api = factory.admin()
  }

  /**
   * What a refused admin call is: a transport failure or a 5xx is an outage, answered `503`
   * `server.unavailable`. Any other failure is an error without a `status`: a 4xx from Supabase
   * Auth refuses the API's key, not the caller, so it is a logged `500`.
   */
  private refused(call: string, error: AuthError): Error {
    if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) {
      this.logger.warn(
        `Supabase Auth did not take ${call}: ${error.status ?? 'no status'} ${error.message}`,
      )
      return unavailable()
    }
    return new Error(`Supabase Auth refused ${call} with ${error.status ?? 'no status'}`, {
      cause: error,
    })
  }

  /** `DELETE /admin/users/:id`, a hard delete: `accounts` and every row referencing it cascade. */
  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.api.deleteUser(id, false)
    if (!error) return true
    if (error.status === 404) return false
    throw this.refused('deleteUser', error)
  }

  /**
   * `PUT /admin/users/:id` with a new password. Supabase Auth then ends every session of the user:
   * the refresh token of a session opened before it is refused.
   */
  async setPassword(id: string, password: string): Promise<void> {
    const { error } = await this.api.updateUserById(id, { password })
    if (error) throw this.refused('updateUserById', error)
  }

  /**
   * `DELETE /admin/users/:id/factors/:factorId`. `false` when the user or the factor was already
   * gone. It ends no session: the caller ends the others with `signOut({ scope: 'others' })`.
   */
  async deleteFactor(userId: string, factorId: string): Promise<boolean> {
    const { error } = await this.api.mfa.deleteFactor({ id: factorId, userId })
    if (!error) return true
    if (error.status === 404) return false
    throw this.refused('deleteFactor', error)
  }

  /**
   * The language of a notice to an account (PLAN.md 6): `accounts.locale`, then the locale sent with
   * the sign-up, then `tenantLocale` of an inviting tenant, which only the user's metadata keeps once the account has gone back to detection
   * (`GET /admin/users/:id`). Only the language hangs on that call, so a failure counts as no locale.
   */
  async noticeLocale(
    account: { id: string; locale: string | null },
    tenantLocale?: string | null,
  ): Promise<Locale> {
    if (isLocale(account.locale)) return account.locale
    const { data, error } = await this.api.getUserById(account.id)
    if (error) this.logger.warn(`Supabase Auth did not answer getUserById: ${error.status}`)
    const metadata = data.user?.user_metadata
    return recipientLocale({ signUp: metadata?.locale, tenant: tenantLocale })
  }

  /** `GET /admin/users/:id/factors`: the ids of the user's factors, none for a user already gone. */
  async factorIds(userId: string): Promise<string[]> {
    const { data, error } = await this.api.mfa.listFactors({ userId })
    if (error) {
      if (error.status === 404) return []
      throw this.refused('listFactors', error)
    }
    return data.factors.map((factor) => factor.id)
  }
}
