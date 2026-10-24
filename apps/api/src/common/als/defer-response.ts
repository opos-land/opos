import { TenantContextService } from './tenant-context.service'

/**
 * oRPC's Nest integration sends its response from inside its own interceptor, before the
 * interceptors around it finish. Inside a tenant transaction the send waits:
 * TenantTransactionInterceptor runs it once the transaction has committed or rolled back
 * (PLAN.md 7.2), so a client never sees a 2xx for a write that did not commit.
 */
export function deferResponseInTenantTransaction(options: {
  next: () => unknown
  standardResponse: { status: number }
}) {
  const store = TenantContextService.peek()
  if (!store?.tx) return options.next()
  store.deferredResponse = { status: options.standardResponse.status, send: () => options.next() }
  return undefined
}
