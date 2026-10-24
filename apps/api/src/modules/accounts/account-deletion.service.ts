import { Injectable } from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { ApiError } from '../../common/errors/api-error'
import { AuthAdminClient } from '../auth/auth-admin.client'

/** How recent the sign-in recorded in the access token must be (PLAN.md 7.4). */
export const RECENT_SIGN_IN_SECONDS = 5 * 60

const lastHead = () =>
  new ApiError(409, 'membership.last-head', 'The account is the last head of a tenant')

/**
 * `DELETE /me`: Supabase Auth deletes the user, and `accounts` cascades from `auth.users` with
 * every row that references it. The admin call runs outside any transaction.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly context: TenantContextService,
    private readonly global: GlobalDbService,
    private readonly admin: AuthAdminClient,
  ) {}

  async deleteCurrent(): Promise<void> {
    if (!this.context.signedInWithin(RECENT_SIGN_IN_SECONDS)) {
      throw new ApiError(
        401,
        'session.reauthentication-required',
        'Deleting the account needs a sign-in from the last 5 minutes',
      )
    }
    if (await this.global.ownLastHead()) throw lastHead()

    try {
      // An account deleted by a concurrent request is gone either way.
      await this.admin.deleteUser(this.context.account().id)
    } catch (error) {
      // A change committed since the check can leave the account a last head; the deferred
      // trigger then refuses the cascade and Supabase Auth answers with a failure of its own.
      if (await this.global.ownLastHead()) throw lastHead()
      throw error
    }
  }
}
