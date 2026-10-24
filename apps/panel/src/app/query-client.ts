import { ORPCError } from '@orpc/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isPermissionDenied } from '../shared/lib/errors'
import { markForbidden } from '../shared/lib/forbidden'
import { membershipsKey } from '../features/tenants'

/**
 * A plain `403` from the API ends on the "no permissions" screen (PLAN.md 8), and the permission
 * store is read again, since the member's permissions changed under the page.
 */
export function createQueryClient() {
  const onError = (error: unknown) => {
    if (!isPermissionDenied(error)) return
    markForbidden()
    void client.invalidateQueries({ queryKey: membershipsKey() })
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
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
