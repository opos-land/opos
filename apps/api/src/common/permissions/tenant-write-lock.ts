/**
 * The key of a tenant's write lock, a transaction-level advisory lock (PLAN.md 7.3), as the
 * signed bigint `pg_advisory_xact_lock` takes: the leading 62 bits of the tenant id with bit 62
 * set, so the key always lies in [2^62, 2^63) and never in the int4 range where Supabase Auth's
 * hashtext() advisory keys fall. Every write route of the tenant holds it from before its
 * permission check until its commit.
 */
export function tenantWriteLockKey(tenantId: string): string {
  const leading = BigInt(`0x${tenantId.replace(/-/g, '').slice(0, 16)}`)
  return ((leading >> 2n) | (1n << 62n)).toString()
}

/** How long a write waits for its tenant's write lock before it answers 503 request.busy. */
export const TENANT_WRITE_LOCK_TIMEOUT_MS = 5000
