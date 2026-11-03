import { Logger } from '@nestjs/common'
import {
  createRemoteJWKSet,
  customFetch,
  decodeJwt,
  errors,
  type JWTPayload,
  jwtVerify,
} from 'jose'
import { type Account, type Me, type SignInMethod } from '@opos/contract'
import { authUrl } from '../../config/env'
import { isUuid } from '../uuid'

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

/** The Nest token of the process's one verifier, which holds the keys it fetched. */
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER')

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

/** An error with its cause: a failed fetch names the network error only there. */
const withCause = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined
  return cause instanceof Error ? `${String(error)}: ${String(cause)}` : String(error)
}

/**
 * Verifies Supabase Auth access tokens against the project's JWKS (PLAN.md 7.4). The keys are held
 * for good and reloaded on a timer, so an outage of Supabase Auth leaves tokens verifying on the
 * last good keys; before the first fetch succeeds a token is `unavailable`, never `invalid`.
 */
export function createAccessTokenVerifier(
  env: { SUPABASE_URL: string },
  options: { fetch?: typeof fetch; refreshEveryMs?: number } = {},
): AccessTokenVerifier {
  const issuer = authUrl(env)
  const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: Infinity,
    timeoutDuration: 2000,
    cooldownDuration: 30_000,
    ...(options.fetch ? { [customFetch]: options.fetch } : {}),
  })

  const timer = setInterval(() => {
    keys.reload().catch((error: unknown) => {
      logger.warn(
        `Reloading the signing keys failed, keeping the last good ones: ${withCause(error)}`,
      )
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
        if (invalidErrors.some((type) => error instanceof type)) return { status: 'invalid' }
        logger.warn(`A token could not be checked: ${withCause(error)}`)
        return { status: 'unavailable' }
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

/**
 * Whether a session Supabase Auth has just issued is at `aal2`. The token comes straight from
 * Supabase Auth, so its claims are read without checking the signature; a token that cannot be
 * read counts as below `aal2`.
 */
export function isAal2(accessToken: string): boolean {
  try {
    return decodeJwt(accessToken).aal === 'aal2'
  } catch {
    return false
  }
}

/** The sign-in methods `GET /me` names, in this order. */
const SIGN_IN_METHODS = [
  ['email', 'password'],
  ['google', 'google'],
] as const

/**
 * The sign-in methods of the account, from the `app_metadata.providers` Supabase Auth writes into
 * the token or the session user: `email` is `password`, `google` is `google`, any other provider is not listed.
 */
export function signInMethodsOf(source: object): SignInMethod[] {
  const providers = (source as { app_metadata?: { providers?: unknown } }).app_metadata?.providers
  if (!Array.isArray(providers)) return []
  return SIGN_IN_METHODS.filter(([provider]) => providers.includes(provider)).map(
    ([, method]) => method,
  )
}

/** The answer of `GET /me`, `POST /auth/sign-in` and `POST /auth/verify`: the one place that builds it. */
export const meOf = (account: Account, signInMethods: SignInMethod[]): Me => ({
  ...account,
  signInMethods,
})
