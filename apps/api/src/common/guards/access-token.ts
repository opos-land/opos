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
  /** The fetch at startup, so the first token waits on nothing; a failure is logged, never thrown. */
  loadKeys(): Promise<void>
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
/** How long no key fetch is made after one failed: jose's own cooldown counts only a success. */
export const KEY_RETRY_MS = 5_000
const logger = new Logger('AccessTokenVerifier')

/** A fetch refused inside the window, which is no failed fetch: it reopens nothing and logs nothing. */
class KeyFetchRefused extends Error {}

/** An error with its cause: a failed fetch names the network error only there. */
const withCause = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined
  return cause instanceof Error ? `${String(error)}: ${String(cause)}` : String(error)
}

/**
 * Verifies Supabase Auth access tokens against the project's JWKS (PLAN.md 7.4). The keys are held
 * for good and reloaded on a timer, so an outage of Supabase Auth leaves tokens verifying on the
 * last good keys; before the first fetch succeeds a token is `unavailable`, never `invalid`. A
 * failed fetch closes the way to the next one for `KEY_RETRY_MS`, so no request waits on a fetch
 * that has just failed.
 */
export function createAccessTokenVerifier(
  env: { SUPABASE_URL: string },
  options: { fetch?: typeof fetch; refreshEveryMs?: number } = {},
): AccessTokenVerifier {
  const issuer = authUrl(env)
  let retryAt = 0

  const fetchKeys: typeof fetch = async (input, init) => {
    if (Date.now() < retryAt) {
      throw new KeyFetchRefused('The last fetch of the signing keys has just failed')
    }
    return (options.fetch ?? fetch)(input, init)
  }

  /** Opens the window and logs once: what fails inside it was refused, or shared that one fetch. */
  const fetchFailed = (what: string, error: unknown) => {
    if (error instanceof KeyFetchRefused || Date.now() < retryAt) return
    retryAt = Date.now() + KEY_RETRY_MS
    logger.warn(`${what}: ${withCause(error)}`)
  }

  const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: Infinity,
    timeoutDuration: 2000,
    cooldownDuration: 30_000,
    [customFetch]: fetchKeys,
  })

  const timer = setInterval(() => {
    keys.reload().catch((error: unknown) => {
      fetchFailed('Reloading the signing keys failed, keeping the last good ones', error)
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
        fetchFailed('A token could not be checked', error)
        return { status: 'unavailable' }
      }
    },
    loadKeys: () =>
      keys.reload().catch((error: unknown) => {
        fetchFailed('Fetching the signing keys at startup failed, the API starts without', error)
      }),
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
