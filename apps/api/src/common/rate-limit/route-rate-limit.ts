import { Inject, Injectable } from '@nestjs/common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ApiError } from '../errors/api-error'
import { type RateLimit } from './rate-limit'

/**
 * The endpoints with a limit of their own, on top of the default. Each one counts in
 * its handler, once the route's guards and permission check have passed, against the tracker it
 * names.
 */
export const ROUTE_RATE_LIMITS = {
  /** Sign-up, resend, sign-in, verify, forgot and Google: one counter, per client address. */
  authentication: { limit: 300, ttl: 300_000 },
  /** `POST /tenants/current/members`, per tenant. */
  invitations: { limit: 20, ttl: 3_600_000 },
  /** `GET /invitations/preview`, per client address. */
  invitationPreview: { limit: 30, ttl: 3_600_000 },
  /** `PUT .../speakers`, per tenant, one for each address not yet a speaker in the edition. */
  speakers: { limit: 100, ttl: 3_600_000 },
  /** `POST /auth/mfa/verify`, `/recover` and `/enable`: one counter, per account. */
  mfa: { limit: 10, ttl: 900_000 },
} satisfies Record<string, RateLimit>

export type RouteRateLimitName = keyof typeof ROUTE_RATE_LIMITS

/** Counts the endpoint limits in the default limit's in-memory storage, under their own keys. */
@Injectable()
export class RouteRateLimiter {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

  /** Spends one request of `tracker`; above the limit, 429 with Retry-After in seconds. */
  async consume(name: RouteRateLimitName, tracker: string) {
    const { limit, ttl } = ROUTE_RATE_LIMITS[name]
    const { isBlocked, timeToBlockExpire } = await this.storage.increment(
      `${name}:${tracker}`,
      ttl,
      limit,
      ttl,
      name,
    )
    if (isBlocked) {
      throw new ApiError(429, 'request.rate-limited', 'Too many requests', undefined, {
        'Retry-After': String(timeToBlockExpire),
      })
    }
  }
}
