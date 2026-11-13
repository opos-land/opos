import { ORPCError } from '@orpc/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isPermissionDenied, isTenantSuspended } from '../shared/lib/errors'
import { markForbidden } from '../shared/lib/forbidden'
import { notifyFailure, notifySuccess } from '../shared/lib/notify'
import { membershipsKey } from '../features/tenants'

/**
 * A plain `403` from the API ends on the "no permissions" screen, and the permission
 * store is read again, since the member's permissions changed under the page. A convention the
 * admin suspended under an open page has the memberships read again too, and the tenant's layout
 * then shows only that it is suspended. Every other outcome of a write is a notification
 * (docs/ARCHITECTURE.md, Frontends).
 */
export function createQueryClient() {
  const onForbidden = (error: unknown) => {
    if (!isPermissionDenied(error)) return false
    markForbidden()
    void client.invalidateQueries({ queryKey: membershipsKey() })
    return true
  }
  const onSuspended = (error: unknown) => {
    if (isTenantSuspended(error)) void client.invalidateQueries({ queryKey: membershipsKey() })
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        onSuspended(error)
        onForbidden(error)
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (result, _variables, _context, mutation) => notifySuccess(mutation.meta, result),
      onError: (error, _variables, _context, mutation) => {
        onSuspended(error)
        if (!onForbidden(error)) notifyFailure(error, mutation.meta)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A refusal does not change on a retry; anything else is tried once more.
        retry: (count, error) => count < 1 && !(error instanceof ORPCError && error.status < 500),
      },
    },
  })
  return client
}
