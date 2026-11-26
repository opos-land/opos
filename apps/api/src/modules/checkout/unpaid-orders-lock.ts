import { createHash } from 'node:crypto'

/**
 * The key of the transaction-level advisory lock under which the orders awaiting payment of an
 * email in an edition are counted, as the signed bigint `pg_advisory_xact_lock` takes: the leading
 * bits of a hash of the two in [2^59, 2^60), apart from a provider account's lock, an owner's
 * file limit, a tenant's write lock and Supabase Auth's keys. No row stands for an email in an
 * edition, so there is none to lock. Two emails that share a key only wait for each other.
 */
export function unpaidOrdersLockKey(editionId: string, email: string): string {
  const hash = createHash('sha256').update(`${editionId}:${email}`).digest('hex')
  const leading = BigInt(`0x${hash.slice(0, 16)}`)
  return ((leading >> 5n) | (1n << 59n)).toString()
}
