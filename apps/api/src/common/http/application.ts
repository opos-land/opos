import { type Env } from '../../config/env'

/**
 * The applications that sign in through the API, each from its own origin and with a cookie pair
 * of its own. A list, so that whatever names the applications names every one of them.
 */
export const APPLICATIONS = ['portal', 'panel', 'admin'] as const

export type Application = (typeof APPLICATIONS)[number]

export type ApplicationUrls = Pick<Env, 'PORTAL_URL' | 'PANEL_URL'> &
  Partial<Pick<Env, 'ADMIN_URL'>>

/**
 * The address of an application; none for the admin application where the API does not serve it
 * (config/env.ts).
 */
export function applicationUrl(app: Application, env: ApplicationUrls): string | undefined {
  switch (app) {
    case 'portal':
      return env.PORTAL_URL
    case 'panel':
      return env.PANEL_URL
    case 'admin':
      return env.ADMIN_URL
  }
}

const originOf = (app: Application, env: ApplicationUrls) => {
  const url = applicationUrl(app, env)
  return url === undefined ? undefined : new URL(url).origin
}

/** The origin of every application the API serves, which CORS names. */
export const applicationOrigins = (env: ApplicationUrls): string[] =>
  APPLICATIONS.map((app) => originOf(app, env)).filter((origin) => origin !== undefined)

/**
 * The application a request comes from: its `Origin` is exactly the address of one. Another
 * subdomain of the same site, another port or scheme, and a request without the header are none.
 */
export function applicationFromOrigin(origin: unknown, env: ApplicationUrls): Application | null {
  if (typeof origin !== 'string') return null
  return APPLICATIONS.find((app) => originOf(app, env) === origin) ?? null
}

// Built from the list: a cookie pair left out here would pass the Origin check below.
const SESSION_COOKIE = new RegExp(
  `(?:^|;\\s*)opos_(?:${APPLICATIONS.join('|')})_(?:access|refresh)=`,
)
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface Request {
  method?: string
  /** The path without the query, as Express gives it. */
  path?: string
  headers: Record<string, string | string[] | undefined>
}

interface Response {
  status(code: number): { json(body: unknown): void }
}

/**
 * A request that changes state and carries a session cookie needs the `Origin` of an application:
 * `403` `request.origin-denied` otherwise, a sibling subdomain included. With `SameSite=Strict`
 * this is the CSRF protection; there is no CSRF token.
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
        message: 'A request that changes state needs the Origin of an application',
      })
      return
    }
    next()
  }

/**
 * What the admin application calls outside `/admin`: sign-in, refresh, sign-out, the code of
 * two-factor authentication, and the account's own name, language and theme. Sign-up, Google
 * sign-in, a password reset, a recovery code and every change of the account's credentials are
 * left out, so a flaw in the admin application cannot take an admin's account over
 * (docs/adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md).
 */
const ADMIN_ORIGIN_ROUTES = new Set([
  'GET /health',
  'POST /auth/sign-in',
  'POST /auth/refresh',
  'POST /auth/sign-out',
  'POST /auth/mfa/verify',
  'GET /me',
  'PATCH /me',
])

/**
 * A request from the admin application's origin reaches the admin routes and the few above, and
 * nothing else: `403` `request.origin-denied`. The path is matched as written, so a spelling that
 * the router would still take, another case or a trailing slash, is refused rather than let by.
 */
export const restrictAdminOrigin =
  (env: ApplicationUrls) => (req: Request, res: Response, next: () => void) => {
    const method = req.method === 'HEAD' ? 'GET' : (req.method ?? '')
    const path = req.path ?? ''
    if (
      applicationFromOrigin(req.headers.origin, env) !== 'admin' ||
      // A preflight carries no credentials and names the route it asks about.
      method === 'OPTIONS' ||
      path.startsWith('/admin/') ||
      ADMIN_ORIGIN_ROUTES.has(`${method} ${path}`)
    ) {
      next()
      return
    }
    res.status(403).json({
      code: 'request.origin-denied',
      message: 'The admin application cannot call this route',
    })
  }
