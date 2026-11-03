import {
  normalizeIp,
  type ThrottlerGetTrackerFunction,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler'
import { type AccessTokenVerifier, bearerToken } from '../guards/access-token'

/** How many requests one tracker makes within `ttl` milliseconds (PLAN.md 7.9). */
export interface RateLimit {
  limit: number
  ttl: number
}

/** The limit of every route that sets none of its own: 300 requests a minute. */
export const DEFAULT_RATE_LIMIT: RateLimit = { limit: 300, ttl: 60_000 }

/**
 * Who a request counts against: the account of a valid access token, otherwise the client
 * address, which `trust proxy` takes from X-Forwarded-For. A token that is invalid, or that cannot
 * be checked while the keys are out of reach, counts against the address, so a forged `sub` never
 * spends another account's requests.
 */
export const rateLimitTracker =
  (verifier: AccessTokenVerifier): ThrottlerGetTrackerFunction =>
  async (req) => {
    const token = bearerToken((req as { headers: Record<string, unknown> }).headers.authorization)
    const check = token ? await verifier.verify(token) : undefined
    if (check?.status === 'valid') return `account:${check.payload.sub}`
    return `ip:${normalizeIp(String((req as { ip?: unknown }).ip))}`
  }

/** In-memory counters; one counter per tracker and limit, shared by every route it covers. */
export function rateLimitModule(verifier: AccessTokenVerifier, rateLimit: RateLimit) {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'default', ...rateLimit }],
    getTracker: rateLimitTracker(verifier),
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  }
  return ThrottlerModule.forRoot(options)
}
