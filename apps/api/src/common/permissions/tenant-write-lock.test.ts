import { describe, expect, it } from 'vitest'
import { tenantWriteLockKey } from './tenant-write-lock'

// Supabase Auth takes session advisory locks on hashtext() keys, which all fall in the int4
// range of the single-bigint key space; a tenant's write lock must never land there.
const int4 = { min: -(2n ** 31n), max: 2n ** 31n - 1n }

describe('tenantWriteLockKey', () => {
  it.each([
    '00000000-0000-4000-8000-000000000000',
    '00000000-7fff-4fff-bfff-ffffffffffff',
    'ffffffff-ffff-4fff-bfff-ffffffffffff',
    'ffffffff-8000-4000-8000-000000000000',
    '7fffffff-ffff-4fff-bfff-ffffffffffff',
  ])('keeps the key of %s a bigint outside the int4 range', (tenantId) => {
    const key = BigInt(tenantWriteLockKey(tenantId))
    expect(key >= -(2n ** 63n) && key < 2n ** 63n).toBe(true)
    expect(key >= int4.min && key <= int4.max).toBe(false)
  })

  it('gives tenants that differ in their leading bits different keys', () => {
    const keys = [
      '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
      '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1f',
      '1f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
      '0f1e2d3c-4b5b-4968-8778-695a4b3c2d1e',
    ].map(tenantWriteLockKey)
    expect(new Set(keys.slice(1)).size).toBe(3)
    expect(keys[0]).not.toBe(keys[2])
    expect(keys[0]).not.toBe(keys[3])
  })
})
