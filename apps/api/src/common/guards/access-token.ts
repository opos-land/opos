import { Logger } from '@nestjs/common'
import { createRemoteJWKSet, customFetch, errors, type JWTPayload, jwtVerify } from 'jose'
import { isUuid } from '../uuid'

/** The rules every Supabase Auth access token passes (PLAN.md 7.4). */
export interface AccessTokenKey {
  key: Uint8Array
  issuer: string
}

export const accessTokenKey = (env: { JWT_SECRET: string; AUTH_URL: string }): AccessTokenKey => ({
  key: new TextEncoder().encode(env.JWT_SECRET),
  issuer: env.AUTH_URL,
})

/** The bearer token of an `Authorization` header, if it carries one. */
export const bearerToken = (header: unknown): string | undefined =>
  typeof header === 'string' ? /^Bearer (\S+)$/.exec(header)?.[1] : undefined

/**
 * The payload of a valid access token with a uuid `sub`, or nothing: signature, `exp` and `sub`
 * required (a token without `exp` never expires), `aud = authenticated`, `iss = AUTH_URL`, HS256
 * only.
 */
export async function verifyAccessToken(
  token: string,
  { key, issuer }: AccessTokenKey,
): Promise<(JWTPayload & { sub: string }) | undefined> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      audience: 'authenticated',
      issuer,
      // jose checks exp only when the claim is present.
      requiredClaims: ['exp', 'sub'],
    })
    return isUuid(payload.sub) ? { ...payload, sub: payload.sub } : undefined
  } catch {
    return undefined
  }
}

export type AccessTokenPayload = JWTPayload & {
  sub: string
  aal?: 'aal1' | 'aal2'
  amr?: unknown
}

/** The three outcomes of checking an access token (PLAN.md 7.4). */
export type TokenCheck =
  | { status: 'valid'; payload: AccessTokenPayload }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export interface AccessTokenVerifier {
  verify(token: string): Promise<TokenCheck>
  /** Stops the background key refresh. */
  close(): void
}

/** A broken rule or a wrong signature; any other failure means the keys could not be had. */
const invalidErrors = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
]

const KEY_REFRESH_MS = 600_000
const logger = new Logger('AccessTokenVerifier')

/**
 * Verifies Supabase Auth access tokens against the project's JWKS (PLAN.md 7.4). The keys are held
 * for good and reloaded on a timer, so an outage of Supabase Auth leaves tokens verifying on the
 * last good keys; before the first fetch succeeds a token is `unavailable`, never `invalid`.
 */
export function createAccessTokenVerifier(
  env: { SUPABASE_URL: string },
  options: { fetch?: typeof fetch; refreshEveryMs?: number } = {},
): AccessTokenVerifier {
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  const issuer = `${base}/auth/v1`
  const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: Infinity,
    timeoutDuration: 2000,
    cooldownDuration: 30_000,
    ...(options.fetch ? { [customFetch]: options.fetch } : {}),
  })

  const timer = setInterval(() => {
    keys.reload().catch((error: unknown) => {
      logger.warn(`Reloading the signing keys failed, keeping the last good ones: ${String(error)}`)
    })
  }, options.refreshEveryMs ?? KEY_REFRESH_MS)
  timer.unref()

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          algorithms: ['ES256'],
          audience: 'authenticated',
          issuer,
          // jose checks exp only when the claim is present.
          requiredClaims: ['exp', 'sub'],
        })
        if (!isUuid(payload.sub) || payload.is_anonymous === true) return { status: 'invalid' }
        return { status: 'valid', payload: { ...payload, sub: payload.sub } }
      } catch (error) {
        return invalidErrors.some((type) => error instanceof type)
          ? { status: 'invalid' }
          : { status: 'unavailable' }
      }
    },
    close: () => clearInterval(timer),
  }
}

/**
 * The latest sign-in the token records: the newest timestamp, in seconds, among the `amr` entries
 * Supabase Auth writes, one per authentication method, kept across refreshes.
 */
export function lastSignInAt(payload: JWTPayload): number | undefined {
  const { amr } = payload
  if (!Array.isArray(amr)) return undefined
  const timestamps = amr
    .map((entry: unknown) => (entry as { timestamp?: unknown } | null)?.timestamp)
    .filter((timestamp): timestamp is number => Number.isFinite(timestamp))
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined
}
