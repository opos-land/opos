import {
  type Contract,
  contract,
  type PublicEdition,
  type PublicProfile,
  type PublicProgramItem,
  type PublicTenant,
} from '@opos/contract'
import { createORPCClient, ORPCError } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { type CacheTimes, createCache } from './cache'

/**
 * What the heads are made of: the API's public answers, each null for what the API does not find.
 * A read fails when the API fails, refuses or cannot be reached, so nothing is taken for missing.
 */
export interface PublicReads {
  convention: (slug: string) => Promise<PublicTenant | null>
  edition: (slug: string, editionSlug: string) => Promise<PublicEdition | null>
  programItem: (
    slug: string,
    editionSlug: string,
    programItemId: string,
  ) => Promise<PublicProgramItem | null>
  profile: (profileId: string) => Promise<PublicProfile | null>
}

/**
 * An answer serves the pages of a minute, so the API hears of an address once a minute however
 * often it is shared; when the API is out of reach, the answer of the last ten minutes stands in.
 * What is missing is remembered as what is there: an address that is not there costs one read too.
 */
const TIMES: CacheTimes = { fresh: 60_000, stale: 600_000, retry: 5_000, max: 2_000 }

/**
 * A profile stands in for nothing: what an account withdrew or an admin took down is in no head a
 * minute later, whether or not the API can be asked again.
 */
const PROFILE_TIMES: CacheTimes = { ...TIMES, stale: TIMES.fresh }

/** How long the API has to answer, in milliseconds: a page never waits longer for its head. */
const TIMEOUT = 2_000

const isNotFound = (error: unknown) => error instanceof ORPCError && error.status === 404

/**
 * The public reads through the contract, as the portal makes them, with no session and no cookie:
 * the server knows of a page only what the API tells anyone.
 */
export function publicReads({
  apiUrl,
  fetch: send = fetch,
  timeout = TIMEOUT,
  now = Date.now,
}: {
  apiUrl: string
  fetch?: (request: Request, init?: RequestInit) => Promise<Response>
  timeout?: number
  now?: () => number
}): PublicReads {
  const link = new OpenAPILink(contract, {
    url: apiUrl.replace(/\/+$/, ''),
    fetch: (request) => send(request, { signal: AbortSignal.timeout(timeout) }),
  })
  const { public: api } = createORPCClient<ContractRouterClient<Contract>>(link)
  const content = createCache<unknown>(TIMES, now)
  const profiles = createCache<unknown>(PROFILE_TIMES, now)

  const read = <T>(cached: typeof content, key: readonly string[], load: () => Promise<T>) =>
    cached(JSON.stringify(key), async () => {
      try {
        return await load()
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    }) as Promise<T | null>

  return {
    convention: (slug) =>
      read(content, ['convention', slug], () => api.tenant({ params: { slug } })),
    edition: (slug, editionSlug) =>
      read(content, ['edition', slug, editionSlug], () =>
        api.edition({ params: { slug, editionSlug } }),
      ),
    programItem: (slug, editionSlug, programItemId) =>
      read(content, ['programItem', slug, editionSlug, programItemId], () =>
        api.programItem({ params: { slug, editionSlug, programItemId } }),
      ),
    profile: (profileId) =>
      read(profiles, ['profile', profileId], () => api.profile({ params: { profileId } })),
  }
}
