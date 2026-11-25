import { createHash } from 'node:crypto'

/**
 * Whose orders awaiting payment are counted: an account's own, or those under an email that are
 * on no account. A visitor's order proves nothing of who placed it, so the two are counted apart.
 */
export type UnpaidOrdersOf = { accountId: string } | { email: string }

/**
 * The key of the transaction-level advisory lock under which the orders awaiting payment of an
 * account, or of an email, in an edition are counted, as the signed bigint
 * `pg_advisory_xact_lock` takes: the leading bits of a hash of the two in [2^59, 2^60), apart
 * from a provider account's lock, an owner's file limit, a tenant's write lock and Supabase
 * Auth's keys. No row stands for a buyer in an edition, so there is none to lock. An account and
 * an email never share what is hashed; two buyers that share a key only wait for each other.
 */
export function unpaidOrdersLockKey(editionId: string, buyer: UnpaidOrdersOf): string {
  const of = 'accountId' in buyer ? `account:${buyer.accountId}` : `email:${buyer.email}`
  const hash = createHash('sha256').update(`${editionId}:${of}`).digest('hex')
  const leading = BigInt(`0x${hash.slice(0, 16)}`)
  return ((leading >> 5n) | (1n << 59n)).toString()
}
