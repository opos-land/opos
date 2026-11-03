import { readSessionCookies } from '../../modules/auth/session-cookies'
import { type Env } from '../../config/env'
import { applicationFromOrigin } from '../http/application'
import { type AccessTokenVerifier, type TokenCheck } from './access-token'

interface CredentialRequest {
  headers: Record<string, string | string[] | undefined>
}

/**
 * The access token a request presents (PLAN.md 7.4): the access cookie of the application its
 * `Origin` names, and nothing else. A request without the `Origin` of an application has no
 * session cookie to read, and `Authorization` is read by the scanner's guard alone.
 */
export function credentialOf(
  req: CredentialRequest,
  env: Pick<Env, 'PORTAL_URL' | 'PANEL_URL'>,
): string | undefined {
  const app = applicationFromOrigin(req.headers.origin, env)
  return app ? readSessionCookies(req, app).access : undefined
}

const outcomes = new WeakMap<object, Map<string, Promise<TokenCheck>>>()

/**
 * Checks `token` once per request: the rate limit and the guard both ask, and a cold outage of the
 * keys would otherwise cost each a fetch. An `unavailable` outcome stays `unavailable` for the
 * request, so the two never disagree.
 */
export function verifyOnce(
  req: object,
  verifier: AccessTokenVerifier,
  token: string,
): Promise<TokenCheck> {
  let checks = outcomes.get(req)
  if (!checks) outcomes.set(req, (checks = new Map<string, Promise<TokenCheck>>()))
  let check = checks.get(token)
  if (!check) checks.set(token, (check = verifier.verify(token)))
  return check
}
