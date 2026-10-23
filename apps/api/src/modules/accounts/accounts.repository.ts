import { Inject, Injectable } from '@nestjs/common'
import { type Account, type UpdateAccount } from '@opos/contract'
import { accounts, type Database } from '@opos/db'
import { isLocale } from '@opos/i18n'
import { eq } from 'drizzle-orm'
import { APP_DB } from '../../common/database/database.module'

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
 * tenant transaction, and every query filters on the account id from the JWT.
 */
@Injectable()
export class AccountsRepository {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  async findById(id: string): Promise<Account | undefined> {
    const [row] = await this.db.select(columns).from(accounts).where(eq(accounts.id, id))
    return row && toAccount(row)
  }

  async update(id: string, changes: UpdateAccount): Promise<Account> {
    if (Object.keys(changes).length === 0) return (await this.findById(id))!
    const [row] = await this.db
      .update(accounts)
      .set(changes)
      .where(eq(accounts.id, id))
      .returning(columns)
    return toAccount(row!)
  }
}
