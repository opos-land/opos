import { Inject, Injectable } from '@nestjs/common'
import { type Account, type UpdateAccount } from '@opos/contract'
import { accounts, type Database } from '@opos/db'
import { isLocale } from '@opos/i18n'
import { eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { APP_DB } from '../../common/database/tokens'
import { unauthenticated } from '../../common/errors/api-error'

const columns = {
  id: accounts.id,
  email: accounts.email,
  firstName: accounts.firstName,
  lastName: accounts.lastName,
  locale: accounts.locale,
}

type Row = { [K in keyof typeof columns]: (typeof accounts.$inferSelect)[K] }

// A locale written by the sign-up trigger is not validated; an unsupported one means "detect".
const toAccount = (row: Row): Account => ({
  ...row,
  locale: isLocale(row.locale) ? row.locale : null,
})

/**
 * `accounts` has no RLS (PLAN.md 4.6): it is read and written on the opos_app pool outside a
 * tenant transaction. Only the guard looks an account up by id, the token's `sub`; every other
 * method works on the account in the request store, so no caller can pass another account's id.
 */
@Injectable()
export class AccountsRepository {
  constructor(
    @Inject(APP_DB) private readonly db: Database,
    private readonly context: TenantContextService,
  ) {}

  /** For JwtAuthGuard only: the account a verified token's `sub` names. */
  async findForToken(sub: string): Promise<Account | undefined> {
    const [row] = await this.db.select(columns).from(accounts).where(eq(accounts.id, sub))
    return row && toAccount(row)
  }

  /** Changes the signed-in account; an account deleted since the guard ran answers 401. */
  async updateCurrent(changes: UpdateAccount): Promise<Account> {
    const { id } = this.context.account()
    const query =
      Object.keys(changes).length === 0
        ? this.db.select(columns).from(accounts).where(eq(accounts.id, id))
        : this.db.update(accounts).set(changes).where(eq(accounts.id, id)).returning(columns)
    const [row] = await query
    if (!row) throw unauthenticated('The account no longer exists')
    return toAccount(row)
  }
}
