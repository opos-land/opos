import { type Session } from '@supabase/auth-js'
import { type Application } from '../../common/http/application'
import { type Env } from '../../config/env'

const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 3600

const names = (app: Application) => ({
  access: `opos_${app}_access`,
  refresh: `opos_${app}_refresh`,
})

interface CookieOptions {
  httpOnly: true
  sameSite: 'strict'
  path: string
  secure: boolean
  maxAge?: number
}

interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): unknown
  clearCookie(name: string, options: Omit<CookieOptions, 'maxAge'>): unknown
}

interface CookieRequest {
  headers: Record<string, string | string[] | undefined>
}

/** Every cookie is `Secure` when the API is served over https (PLAN.md 7.4). */
const attributes = (env: Pick<Env, 'API_URL'>, path: string) => ({
  httpOnly: true as const,
  sameSite: 'strict' as const,
  path,
  secure: new URL(env.API_URL).protocol === 'https:',
})

/**
 * Sets the session of `app` (PLAN.md 7.4): the access token to its `exp`, the refresh token for 30
 * days, on the API's own host with no `Domain`. Nothing of the other application's pair changes.
 */
export function setSessionCookies(
  res: CookieResponse,
  app: Application,
  session: Pick<Session, 'access_token' | 'refresh_token' | 'expires_in' | 'expires_at'>,
  env: Pick<Env, 'API_URL'>,
  now = Math.floor(Date.now() / 1000),
): void {
  const expiresAt = session.expires_at ?? now + session.expires_in
  const { access, refresh } = names(app)
  res.cookie(access, session.access_token, {
    ...attributes(env, '/'),
    maxAge: Math.max(0, expiresAt - now) * 1000,
  })
  res.cookie(refresh, session.refresh_token, {
    ...attributes(env, '/auth'),
    maxAge: REFRESH_MAX_AGE_SECONDS * 1000,
  })
}

/** Clears the pair of `app` with the paths and attributes it was set with. */
export function clearSessionCookies(
  res: CookieResponse,
  app: Application,
  env: Pick<Env, 'API_URL'>,
): void {
  const { access, refresh } = names(app)
  res.clearCookie(access, attributes(env, '/'))
  res.clearCookie(refresh, attributes(env, '/auth'))
}

/** The cookies of one `Cookie` header; the first of a repeated name wins, a bad value is skipped. */
function parseCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (cookies.has(name)) continue
    try {
      cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()))
    } catch {
      // A value that is not valid percent-encoding is no session of ours.
    }
  }
  return cookies
}

/** The session cookies of `app` the request carries; the other application's are never read. */
export function readSessionCookies(
  req: CookieRequest,
  app: Application,
): { access?: string; refresh?: string } {
  const header = req.headers.cookie
  if (typeof header !== 'string') return {}
  const cookies = parseCookies(header)
  const { access, refresh } = names(app)
  return {
    ...(cookies.has(access) ? { access: cookies.get(access) } : {}),
    ...(cookies.has(refresh) ? { refresh: cookies.get(refresh) } : {}),
  }
}
