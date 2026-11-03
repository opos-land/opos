import { Inject, Injectable } from '@nestjs/common'
import { accountRecoveryCodes, type Database } from '@opos/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { APP_DB } from '../../common/database/tokens'

/**
 * `account_recovery_codes` has no RLS (PLAN.md 4.2): it is read and written on the opos_app pool
 * outside a tenant transaction, like `accounts`. Every method works on the account in the request
 * store, so no caller can pass another account's id (PLAN.md 7.2). The table keeps hashes only.
 */
@Injectable()
export class RecoveryCodesRepository {
  constructor(
    @Inject(APP_DB) private readonly db: Database,
    private readonly context: TenantContextService,
  ) {}

  private get accountId() {
    return this.context.account().id
  }

  /**
   * Replaces the account's unused codes with `hashes`, in one transaction. A code already used
   * stays, as a record.
   */
  async replaceUnused(hashes: string[]): Promise<void> {
    const accountId = this.accountId
    await this.db.transaction(async (tx) => {
      await tx
        .delete(accountRecoveryCodes)
        .where(
          and(eq(accountRecoveryCodes.accountId, accountId), isNull(accountRecoveryCodes.usedAt)),
        )
      await tx
        .insert(accountRecoveryCodes)
        .values(hashes.map((codeHash) => ({ accountId, codeHash })))
    })
  }

  /** Whether the account holds an unused code with this hash; the unique index serves the lookup. */
  async hasUnused(hash: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: accountRecoveryCodes.id })
      .from(accountRecoveryCodes)
      .where(
        and(
          eq(accountRecoveryCodes.accountId, this.accountId),
          eq(accountRecoveryCodes.codeHash, hash),
          isNull(accountRecoveryCodes.usedAt),
        ),
      )
    return row !== undefined
  }

  /** Spends the code; `false` when another request spent it first. */
  async markUsed(hash: string): Promise<boolean> {
    const rows = await this.db
      .update(accountRecoveryCodes)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(accountRecoveryCodes.accountId, this.accountId),
          eq(accountRecoveryCodes.codeHash, hash),
          isNull(accountRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: accountRecoveryCodes.id })
    return rows.length > 0
  }

  /** Removes the account's unused codes. */
  async deleteUnused(): Promise<void> {
    await this.db
      .delete(accountRecoveryCodes)
      .where(
        and(
          eq(accountRecoveryCodes.accountId, this.accountId),
          isNull(accountRecoveryCodes.usedAt),
        ),
      )
  }
}
