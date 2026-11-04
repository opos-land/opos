import { type Env } from '../../config/env'

/** The two applications that sign in through the API (PLAN.md 5.1). */
export type Application = 'portal' | 'panel'

type ApplicationUrls = Pick<Env, 'PORTAL_URL' | 'PANEL_URL'>

/**
 * The application a request comes from: its `Origin` is exactly `PORTAL_URL` or `PANEL_URL`.
 * Another subdomain of the same site, another port or scheme, and a request without the header are
 * none (PLAN.md 7.4).
 */
export function applicationFromOrigin(origin: unknown, env: ApplicationUrls): Application | null {
  if (typeof origin !== 'string') return null
  if (origin === new URL(env.PORTAL_URL).origin) return 'portal'
  if (origin === new URL(env.PANEL_URL).origin) return 'panel'
  return null
}

const SESSION_COOKIE = /(?:^|;\s*)opos_(?:portal|panel)_(?:access|refresh)=/
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface Request {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

interface Response {
  status(code: number): { json(body: unknown): void }
}

/**
 * A request that changes state and carries a session cookie needs the `Origin` of an application:
 * `403` `request.origin-denied` otherwise, a sibling subdomain included. With `SameSite=Strict`
 * this is the CSRF protection; there is no CSRF token (PLAN.md 7.4).
 */
export const requireOriginForSession =
  (env: ApplicationUrls) => (req: Request, res: Response, next: () => void) => {
    const cookie = req.headers.cookie
    const carriesSession = typeof cookie === 'string' && SESSION_COOKIE.test(cookie)
    if (
      carriesSession &&
      STATE_CHANGING.has(req.method ?? '') &&
      applicationFromOrigin(req.headers.origin, env) === null
    ) {
      res.status(403).json({
        code: 'request.origin-denied',
        message: 'A request that changes state needs the Origin of the panel or the portal',
      })
      return
    }
    next()
  }
