import {
  normalizeIp,
  type ThrottlerGetTrackerFunction,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler'
import { type Env } from '../../config/env'
import {
  type AccessTokenKey,
  accessTokenKey,
  bearerToken,
  verifyAccessToken,
} from '../guards/access-token'

/** How many requests one tracker makes within `ttl` milliseconds (PLAN.md 7.9). */
export interface RateLimit {
  limit: number
  ttl: number
}

/** The limit of every route that sets none of its own: 300 requests a minute. */
export const DEFAULT_RATE_LIMIT: RateLimit = { limit: 300, ttl: 60_000 }

/**
 * Who a request counts against: the account of a valid access token, otherwise the client
 * address, which `trust proxy` takes from X-Forwarded-For. An invalid token counts against the
 * address, so a forged `sub` never spends another account's requests.
 */
export const rateLimitTracker =
  (key: AccessTokenKey): ThrottlerGetTrackerFunction =>
  async (req) => {
    const token = bearerToken((req as { headers: Record<string, unknown> }).headers.authorization)
    const payload = token ? await verifyAccessToken(token, key) : undefined
    if (payload) return `account:${payload.sub}`
    return `ip:${normalizeIp(String((req as { ip?: unknown }).ip))}`
  }

/** In-memory counters; one counter per tracker and limit, shared by every route it covers. */
export function rateLimitModule(env: Env, rateLimit: RateLimit) {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'default', ...rateLimit }],
    getTracker: rateLimitTracker(accessTokenKey(env)),
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  }
  return ThrottlerModule.forRoot(options)
}
