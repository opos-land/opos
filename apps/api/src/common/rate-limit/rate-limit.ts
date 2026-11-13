import {
  normalizeIp,
  type ThrottlerGetTrackerFunction,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler'
import { type ApplicationUrls } from '../http/application'
import { type AccessTokenVerifier } from '../guards/access-token'
import { credentialOf, verifyOnce } from '../guards/request-credential'

/** How many requests one tracker makes within `ttl` milliseconds. */
export interface RateLimit {
  limit: number
  ttl: number
}

/** The limit of every route that sets none of its own: 300 requests a minute. */
export const DEFAULT_RATE_LIMIT: RateLimit = { limit: 300, ttl: 60_000 }

/**
 * Who a request counts against: the account of a valid access token (the cookie, as the guard reads
 * it, and the same verification), at `aal2` under a counter of its own, so a password alone at
 * `aal1` cannot use up the limit of the owner's `aal2` session and signing in again resets nothing;
 * otherwise the client address, which `trust proxy` takes from X-Forwarded-For. A token that is
 * invalid, or that cannot be checked while the keys are out of reach, counts against the address,
 * so a forged claim never spends another account's requests.
 */
export const rateLimitTracker =
  (verifier: AccessTokenVerifier, env: ApplicationUrls): ThrottlerGetTrackerFunction =>
  async (req) => {
    const token = credentialOf(req as Parameters<typeof credentialOf>[0], env)
    const check = token ? await verifyOnce(req as object, verifier, token) : undefined
    if (check?.status === 'valid') {
      const { aal, sub } = check.payload
      return aal === 'aal2' ? `account:${sub}:aal2` : `account:${sub}`
    }
    return `ip:${normalizeIp(String((req as { ip?: unknown }).ip))}`
  }

/** In-memory counters; one counter per tracker and limit, shared by every route it covers. */
export function rateLimitModule(
  verifier: AccessTokenVerifier,
  rateLimit: RateLimit,
  env: ApplicationUrls,
) {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'default', ...rateLimit }],
    getTracker: rateLimitTracker(verifier, env),
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  }
  return ThrottlerModule.forRoot(options)
}
