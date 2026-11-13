import { ORPCError } from '@orpc/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { errorCode } from '../shared/lib/errors'
import { notifyFailure, notifySignInAgain, notifySuccess } from '../shared/lib/notify'
import { signInAgain } from '../shared/lib/session'

/**
 * Every outcome of a write is a notification (docs/ARCHITECTURE.md, Frontends). An admin's
 * sign-in opens the admin routes for 30 minutes, and the two actions that cannot be undone for 5:
 * a call answered `session.reauthentication-required` leads back to sign-in, by password and
 * code, and the page the admin was on opens again afterwards. A write so refused also says that
 * it has to be repeated.
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (errorCode(error) === 'session.reauthentication-required') signInAgain()
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (result, _variables, _context, mutation) => notifySuccess(mutation.meta, result),
      onError: (error, _variables, _context, mutation) => {
        if (errorCode(error) !== 'session.reauthentication-required') {
          notifyFailure(error, mutation.meta)
          return
        }
        notifySignInAgain()
        signInAgain()
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
}
