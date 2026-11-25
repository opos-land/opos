import { Inject, Injectable } from '@nestjs/common'
import { ThrottlerStorage, type ThrottlerStorageService } from '@nestjs/throttler'
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
  /** Every admin route that changes anything: one counter, per admin. */
  adminWrites: { limit: 60, ttl: 3_600_000 },
  /** Every route that takes a file: one counter, per account (modules/files). */
  uploads: { limit: 120, ttl: 3_600_000 },
  /** `PUT /shop/provider-account`, per tenant: each one asks the payment provider from OPOS. */
  providerConnects: { limit: 20, ttl: 3_600_000 },
  /** `POST .../shop/quote`, per client address: a cart is priced on every change of it. */
  shopQuotes: { limit: 600, ttl: 3_600_000 },
  /** Placing an order, by a visitor or by an account: one counter, per client address. */
  orderPlacements: { limit: 300, ttl: 3_600_000 },
  /** Starting a payment attempt, by a visitor or by an account: one counter, per client address. */
  paymentAttempts: { limit: 300, ttl: 3_600_000 },
  /**
   * Starting a payment attempt for one order, per order, once its opener may open it: each start
   * asks the provider about every earlier attempt of the order, from the address OPOS shares.
   */
  paymentAttemptsOfOrder: { limit: 20, ttl: 3_600_000 },
  /** Resending an order's confirmation, per order: each one is an email to its buyer. */
  confirmationResends: { limit: 5, ttl: 3_600_000 },
  /**
   * A quote that tries a discount code, and an order whose code cannot be used: one counter, per
   * client address. A code is guessed by nobody, and an order that uses its code spends nothing.
   */
  discountCodeTries: { limit: 30, ttl: 3_600_000 },
  /** The files of an edition's sales, per account: they hold names and email addresses. */
  salesExports: { limit: 30, ttl: 3_600_000 },
  /** `POST /public/order-links/open`, per client address: a token is guessed by nobody. */
  orderLinkOpens: { limit: 60, ttl: 3_600_000 },
  /** `POST /public/order-links/renew`, per client address. */
  orderLinkRenewals: { limit: 10, ttl: 3_600_000 },
  /** `POST /scanner/pair`, per client address: a pairing code is guessed by nobody. */
  scannerPairings: { limit: 30, ttl: 3_600_000 },
  /** `POST /scanner/scans`, per scanner: a busy gate reads a code every few seconds. */
  scannerScans: { limit: 6000, ttl: 3_600_000 },
  /** `POST /scanner/hand-outs`, per scanner. */
  scannerHandOuts: { limit: 6000, ttl: 3_600_000 },
  /** A report of a profile, per client address: each one may be an email to an address it names. */
  profileReports: { limit: 10, ttl: 3_600_000 },
} satisfies Record<string, RateLimit>

export type RouteRateLimitName = keyof typeof ROUTE_RATE_LIMITS

const rateLimited = (retryAfterSeconds: number) =>
  new ApiError(429, 'request.rate-limited', 'Too many requests', undefined, {
    'Retry-After': String(retryAfterSeconds),
  })

/** Counts the endpoint limits in the default limit's in-memory storage, under their own keys. */
@Injectable()
export class RouteRateLimiter {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorageService) {}

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
    if (isBlocked) throw rateLimited(timeToBlockExpire)
  }

  /**
   * Refuses a blocked `tracker` with the 429 `consume` answers it, and spends nothing: for a
   * route that counts only its requests that fail, each with `spend` once it is answered.
   */
  check(name: RouteRateLimitName, tracker: string) {
    const record = this.storage.storage.get(`${name}:${tracker}`)
    if (!record?.isBlocked) return
    const retryAfter = Math.ceil((record.blockExpiresAt - Date.now()) / 1000)
    if (retryAfter > 0) throw rateLimited(retryAfter)
  }

  /**
   * Spends one request of `tracker` for a request already answered, and refuses nothing. The
   * tracker that spends the last request of its limit is blocked at once, where `consume` blocks
   * the one that asks for one more: the next `check` or `consume` refuses it.
   */
  async spend(name: RouteRateLimitName, tracker: string) {
    const { limit, ttl } = ROUTE_RATE_LIMITS[name]
    await this.storage.increment(`${name}:${tracker}`, ttl, limit - 1, ttl, name)
  }
}
