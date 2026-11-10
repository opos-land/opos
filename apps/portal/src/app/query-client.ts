import { ORPCError } from '@orpc/client'
import { MutationCache, QueryClient } from '@tanstack/react-query'
import { notifyFailure, notifySuccess } from '../shared/lib/notify'

/** Every outcome of a write is a notification (docs/ARCHITECTURE.md, Frontends). */
export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (result, _variables, _context, mutation) => notifySuccess(mutation.meta, result),
      onError: (error, _variables, _context, mutation) => notifyFailure(error, mutation.meta),
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
}
