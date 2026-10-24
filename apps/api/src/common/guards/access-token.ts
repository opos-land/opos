import { type JWTPayload, jwtVerify } from 'jose'
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
