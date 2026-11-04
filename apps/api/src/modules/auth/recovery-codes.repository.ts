import { Inject, Injectable } from '@nestjs/common'
import { accountRecoveryCodes, accounts, type Database } from '@opos/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { APP_DB } from '../../common/database/tokens'
import { postgresCode } from '../../common/filters/http-exception.filter'

/**
 * A failed query of the store. drizzle's own error carries the query with its parameters, which
 * here are the hashes of recovery codes, so this one names the operation and the SQLSTATE only and
 * keeps no `cause`.
 */
export class RecoveryCodeStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Recovery code store: ${operation} failed (${postgresCode(cause) ?? 'no SQLSTATE'})`)
    this.name = 'RecoveryCodeStoreError'
  }
}

async function guarded<T>(operation: string, query: () => Promise<T>): Promise<T> {
  try {
    return await query()
  } catch (error) {
    throw new RecoveryCodeStoreError(operation, error)
  }
}

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
   * Replaces the account's unused codes with `hashes`, in one transaction, and says whether it did.
   * A code already used stays, as a record. The first statement locks the account row, the lock
   * the mirror trigger takes when a factor is verified, and `false` comes back with nothing
   * deleted when 2FA is already on: a request that races a verified `enable` can neither destroy
   * its codes nor be handed codes that the other then replaces.
   */
  replaceUnused(hashes: string[]): Promise<boolean> {
    const accountId = this.accountId
    return guarded('replaceUnused', () =>
      this.db.transaction(async (tx) => {
        const [account] = await tx
          .select({ mfaEnabledAt: accounts.mfaEnabledAt })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('no key update')
        if (account?.mfaEnabledAt) return false
        await tx
          .delete(accountRecoveryCodes)
          .where(
            and(eq(accountRecoveryCodes.accountId, accountId), isNull(accountRecoveryCodes.usedAt)),
          )
        await tx
          .insert(accountRecoveryCodes)
          .values(hashes.map((codeHash) => ({ accountId, codeHash })))
        return true
      }),
    )
  }

  /** Whether the account still holds every one of these hashes unused, as `enable` stored them. */
  holdsUnused(hashes: string[]): Promise<boolean> {
    return guarded('holdsUnused', async () => {
      const [row] = await this.db
        .select({ held: sql<number>`count(*)::int` })
        .from(accountRecoveryCodes)
        .where(
          and(
            eq(accountRecoveryCodes.accountId, this.accountId),
            inArray(accountRecoveryCodes.codeHash, hashes),
            isNull(accountRecoveryCodes.usedAt),
          ),
        )
      return row?.held === hashes.length
    })
  }

  /** Whether the account holds an unused code with this hash; the unique index serves the lookup. */
  hasUnused(hash: string): Promise<boolean> {
    return guarded('hasUnused', async () => {
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
    })
  }

  /** Spends the code; `false` when another request spent it first. */
  markUsed(hash: string): Promise<boolean> {
    return guarded('markUsed', async () => {
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
    })
  }

  /** Removes the account's unused codes. */
  deleteUnused(): Promise<void> {
    return guarded('deleteUnused', async () => {
      await this.db
        .delete(accountRecoveryCodes)
        .where(
          and(
            eq(accountRecoveryCodes.accountId, this.accountId),
            isNull(accountRecoveryCodes.usedAt),
          ),
        )
    })
  }
}
