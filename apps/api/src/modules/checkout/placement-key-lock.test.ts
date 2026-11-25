import { describe, expect, it } from 'vitest'
import { tenantWriteLockKey } from '../../common/permissions/tenant-write-lock'
import { fileLimitLockKey } from '../files/owners'
import { providerAccountLockKey } from '../shop/provider-account-lock'
import { placementKeyHash, placementKeyLockKey } from './placement-key-lock'
import { unpaidOrdersLockKey } from './unpaid-orders-lock'

const edition = '0198c1a0-0000-7000-8000-000000000001'
const other = '0198c1a0-0000-7000-8000-000000000002'
const account = '0198c1a0-0000-7000-8000-00000000000a'
// A placement key as a browser draws one, written out so that it is plainly no secret.
const key = '0198c1a0-0000-4000-8000-0000000000b1'

describe('the hash an order keeps of its placement key', () => {
  it('gives nothing of the key back, and is the same each time', () => {
    const hash = placementKeyHash(key, {})

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(key)
    expect(placementKeyHash(key, {})).toBe(hash)
    expect(placementKeyHash('0198c1a0-0000-4000-8000-0000000000b2', {})).not.toBe(hash)
  })

  // A key is its buyer's: an account's finds the order that account placed, and no order a
  // visitor or another account placed with the same key.
  it('is an account’s own, apart from a visitor’s and from another account’s', () => {
    const own = placementKeyHash(key, { accountId: account })

    expect(placementKeyHash(key, { accountId: account })).toBe(own)
    expect(placementKeyHash(key, {})).not.toBe(own)
    expect(placementKeyHash(key, { accountId: other })).not.toBe(own)
    // No key a visitor sends is hashed as an account's is, whatever it is written as.
    expect(placementKeyHash(`${account}:${key}`, {})).not.toBe(own)
    expect(placementKeyHash(`account:${account}:${key}`, {})).not.toBe(own)
  })
})

describe('the key of the lock on a placement key in an edition', () => {
  const hash = placementKeyHash(key, {})

  // A signed bigint, as pg_advisory_xact_lock takes, in a range of its own: below the keys of a
  // buyer's unpaid orders, a provider account, an owner's file limit and a tenant's write lock,
  // above Supabase Auth's int4.
  it.each([hash, placementKeyHash(key, { accountId: account }), 'f'.repeat(64), '0'.repeat(64)])(
    'lies in [2^58, 2^59) for %s',
    (of) => {
      const lock = BigInt(placementKeyLockKey(edition, of))

      expect(lock >= 1n << 58n).toBe(true)
      expect(lock < 1n << 59n).toBe(true)
      expect(lock < BigInt(unpaidOrdersLockKey(edition, { email: 'buyer@example.test' }))).toBe(
        true,
      )
      for (const taken of [tenantWriteLockKey, fileLimitLockKey, providerAccountLockKey]) {
        expect(lock < BigInt(taken(edition))).toBe(true)
      }
    },
  )

  it('is the same for a key in an edition each time, and another for another of either', () => {
    const lock = placementKeyLockKey(edition, hash)

    expect(placementKeyLockKey(edition, hash)).toBe(lock)
    expect(placementKeyLockKey(other, hash)).not.toBe(lock)
    expect(placementKeyLockKey(edition, placementKeyHash(key, { accountId: account }))).not.toBe(
      lock,
    )
  })
})
