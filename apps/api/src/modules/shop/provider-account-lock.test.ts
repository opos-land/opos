import { describe, expect, it } from 'vitest'
import { fileLimitLockKey } from '../files/owners'
import { tenantWriteLockKey } from '../../common/permissions/tenant-write-lock'
import { providerAccountLockKey } from './provider-account-lock'

describe('the key of the lock on a tenant\u2019s provider account', () => {
  const ids = [
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '0198c1a0-0000-7000-8000-000000000001',
  ]

  // A signed bigint, as pg_advisory_xact_lock takes, in a range of its own: apart from the keys
  // of a tenant's write lock, of an owner's file limit and of Supabase Auth, which are int4.
  it.each(ids)('lies in [2^60, 2^61) for %s', (id) => {
    const key = BigInt(providerAccountLockKey(id))

    expect(key >= 1n << 60n).toBe(true)
    expect(key < 1n << 61n).toBe(true)
    expect(providerAccountLockKey(id)).not.toBe(tenantWriteLockKey(id))
    expect(providerAccountLockKey(id)).not.toBe(fileLimitLockKey(id))
  })

  it('is the same for a tenant each time, and another for another tenant', () => {
    expect(providerAccountLockKey(ids[2]!)).toBe(providerAccountLockKey(ids[2]!))
    expect(providerAccountLockKey(ids[2]!)).not.toBe(providerAccountLockKey(ids[1]!))
  })
})
