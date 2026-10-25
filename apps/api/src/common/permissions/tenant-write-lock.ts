/**
 * The key of a tenant's write lock, a transaction-level advisory lock (PLAN.md 7.3): the first 64
 * bits of the tenant id as the signed bigint `pg_advisory_xact_lock` takes. Every write route of
 * the tenant holds it from before its permission check until its commit.
 */
export function tenantWriteLockKey(tenantId: string): string {
  const high = BigInt(`0x${tenantId.replace(/-/g, '').slice(0, 16)}`)
  return BigInt.asIntN(64, high).toString()
}
