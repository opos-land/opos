import { createHash } from 'node:crypto'
import { hashOf } from './codes'

/**
 * What an order keeps of the key its checkout placed it with: a hash, since the key is the
 * buyer's secret as a result token is. An account's is hashed with the account, so the key an
 * account placed an order with finds that order for the account alone, and a visitor's key never
 * finds an order an account placed, whatever the key is written as.
 */
export const placementKeyHash = (key: string, buyer: { accountId?: string }) =>
  hashOf(buyer.accountId ? `account:${buyer.accountId}:${key}` : `visitor:${key}`)

/**
 * The key of the transaction-level advisory lock under which a checkout looks for the order its
 * placement key placed, and places it where there is none, as the signed bigint
 * `pg_advisory_xact_lock` takes: the leading bits of a hash of the edition and the key's hash in
 * [2^58, 2^59), apart from a buyer's unpaid orders, a provider account's lock, an owner's file
 * limit, a tenant's write lock and Supabase Auth's keys. No row stands for a key before its order
 * is placed, so there is none to lock. Two keys that share a lock only wait for each other.
 */
export function placementKeyLockKey(editionId: string, keyHash: string): string {
  const hash = createHash('sha256').update(`${editionId}:placement:${keyHash}`).digest('hex')
  const leading = BigInt(`0x${hash.slice(0, 16)}`)
  return ((leading >> 6n) | (1n << 58n)).toString()
}
