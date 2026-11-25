import { describe, expect, it } from 'vitest'
import { tenantWriteLockKey } from '../../common/permissions/tenant-write-lock'
import { fileLimitLockKey } from '../files/owners'
import { providerAccountLockKey } from '../shop/provider-account-lock'
import { unpaidOrdersLockKey } from './unpaid-orders-lock'

describe('the key of the lock on the unpaid orders of an email in an edition', () => {
  const edition = '0198c1a0-0000-7000-8000-000000000001'
  const other = '0198c1a0-0000-7000-8000-000000000002'

  // A signed bigint, as pg_advisory_xact_lock takes, in a range of its own: below the keys of a
  // provider account, an owner's file limit and a tenant's write lock, above Supabase Auth's int4.
  it.each(['buyer@example.test', '', 'a'.repeat(320)])('lies in [2^59, 2^60) for "%s"', (email) => {
    const key = BigInt(unpaidOrdersLockKey(edition, email))

    expect(key >= 1n << 59n).toBe(true)
    expect(key < 1n << 60n).toBe(true)
    for (const taken of [tenantWriteLockKey, fileLimitLockKey, providerAccountLockKey]) {
      expect(key < BigInt(taken(edition))).toBe(true)
    }
  })

  it('is the same for an email in an edition each time, and another for another of either', () => {
    const key = unpaidOrdersLockKey(edition, 'buyer@example.test')

    expect(unpaidOrdersLockKey(edition, 'buyer@example.test')).toBe(key)
    expect(unpaidOrdersLockKey(edition, 'other@example.test')).not.toBe(key)
    expect(unpaidOrdersLockKey(other, 'buyer@example.test')).not.toBe(key)
  })
})
