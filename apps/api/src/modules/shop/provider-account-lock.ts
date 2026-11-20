/**
 * The key of the transaction-level advisory lock that keeps a tenant's provider account as it is,
 * as the signed bigint `pg_advisory_xact_lock` takes: the leading bits of the tenant's id in
 * [2^60, 2^61), apart from a tenant's write lock, an owner's file limit and Supabase Auth's keys.
 * An order with something to pay takes it shared while it is placed; a change of the credentials
 * takes it alone. The role of the API holds no row lock on the account: it never updates one.
 */
export function providerAccountLockKey(tenantId: string): string {
  const leading = BigInt(`0x${tenantId.replace(/-/g, '').slice(0, 16)}`)
  return ((leading >> 4n) | (1n << 60n)).toString()
}
