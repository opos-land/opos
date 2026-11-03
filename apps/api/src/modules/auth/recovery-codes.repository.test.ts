import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { RecoveryCodeStoreError, RecoveryCodesRepository } from './recovery-codes.repository'

// A query that fails carries its parameters in the error, and a parameter here is the SHA-256 of a
// recovery code: none of it may leave the repository (PLAN.md 7.12).

const hash = 'a'.repeat(64)
const accountId = randomUUID()
const context = { account: () => ({ id: accountId }) } as unknown as TenantContextService

/** What drizzle throws: a message with the query and its parameters, and a Postgres cause. */
const drizzleFailure = () =>
  Object.assign(
    new Error(`Failed query: select "id" from "account_recovery_codes"\nparams: ${hash}`),
    {
      cause: Object.assign(new Error('connection terminated'), {
        severity: 'FATAL',
        code: '57P01',
      }),
    },
  )

/** A database on which every chain of calls ends in the rejection of a failed query. */
const rejecting = (): unknown =>
  new Proxy(() => undefined, {
    get: (_, property) =>
      property === 'then'
        ? (_: unknown, reject: (error: unknown) => void) => reject(drizzleFailure())
        : rejecting(),
    apply: () => rejecting(),
  })

const repository = () => new RecoveryCodesRepository(rejecting() as never, context)

describe('RecoveryCodesRepository failures', () => {
  it.each([
    ['hasUnused', (r: RecoveryCodesRepository) => r.hasUnused(hash)],
    ['markUsed', (r: RecoveryCodesRepository) => r.markUsed(hash)],
    ['replaceUnused', (r: RecoveryCodesRepository) => r.replaceUnused([hash])],
    ['holdsUnused', (r: RecoveryCodesRepository) => r.holdsUnused([hash])],
    ['deleteUnused', (r: RecoveryCodesRepository) => r.deleteUnused()],
  ])('%s fails without the hash in the message, the cause or the stack', async (_, call) => {
    const failure = await call(repository()).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(RecoveryCodeStoreError)
    const error = failure as RecoveryCodeStoreError
    expect(error.message).not.toContain(hash)
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(hash)
    expect(String(error.stack)).not.toContain(hash)
    expect(error.cause).toBeUndefined()
  })
})
