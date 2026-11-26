import { describe, expect, it } from 'vitest'
import { tenantWriteLockKey } from '../../common/permissions/tenant-write-lock'
import { fileLimitLockKey } from '../files/owners'
import { providerAccountLockKey } from '../shop/provider-account-lock'
import { unpaidOrdersLockKey } from './unpaid-orders-lock'

describe('the key of the lock on the unpaid orders of a buyer in an edition', () => {
  const edition = '0198c1a0-0000-7000-8000-000000000001'
  const other = '0198c1a0-0000-7000-8000-000000000002'
  const account = '0198c1a0-0000-7000-8000-00000000000a'

  // A signed bigint, as pg_advisory_xact_lock takes, in a range of its own: below the keys of a
  // provider account, an owner's file limit and a tenant's write lock, above Supabase Auth's int4.
  it.each([
    { email: 'buyer@example.test' },
    { email: '' },
    { email: 'a'.repeat(320) },
    { accountId: account },
  ])('lies in [2^59, 2^60) for %o', (buyer) => {
    const key = BigInt(unpaidOrdersLockKey(edition, buyer))

    expect(key >= 1n << 59n).toBe(true)
    expect(key < 1n << 60n).toBe(true)
    for (const taken of [tenantWriteLockKey, fileLimitLockKey, providerAccountLockKey]) {
      expect(key < BigInt(taken(edition))).toBe(true)
    }
  })

  it('is the same for an email in an edition each time, and another for another of either', () => {
    const key = unpaidOrdersLockKey(edition, { email: 'buyer@example.test' })

    expect(unpaidOrdersLockKey(edition, { email: 'buyer@example.test' })).toBe(key)
    expect(unpaidOrdersLockKey(edition, { email: 'other@example.test' })).not.toBe(key)
    expect(unpaidOrdersLockKey(other, { email: 'buyer@example.test' })).not.toBe(key)
  })

  // An account's orders and a visitor's are counted apart, so they wait for nothing of each
  // other: an account is never an email, whatever either is written as.
  it('is an account’s own, apart from every email and from the account in another edition', () => {
    const key = unpaidOrdersLockKey(edition, { accountId: account })

    expect(unpaidOrdersLockKey(edition, { accountId: account })).toBe(key)
    expect(unpaidOrdersLockKey(edition, { accountId: other })).not.toBe(key)
    expect(unpaidOrdersLockKey(other, { accountId: account })).not.toBe(key)
    expect(unpaidOrdersLockKey(edition, { email: account })).not.toBe(key)
    expect(unpaidOrdersLockKey(edition, { email: `account:${account}` })).not.toBe(key)
  })
})
