/** How a `POST /auth/refresh` ended (PLAN.md 7.4): only `signed-out` ends the session. */
export type RefreshResult = 'refreshed' | 'signed-out' | 'unavailable'

export interface ApiFetchOptions {
  /** Rotates the session cookies; shared by the requests waiting on it and across tabs. */
  refresh(): Promise<RefreshResult>
  /** The session is over: a refresh answered `401`, or the retry was refused again. */
  onSignedOut(): void
  /** A `401` `session.mfa-required` came back: the code screen is next (PLAN.md 7.12). */
  onMfaRequired(): void
  /** Sent as X-Tenant-Slug; the API ignores it on routes outside a tenant (PLAN.md 7.2). */
  tenantSlug?: string
  /** The active interface language, sent as Accept-Language. */
  locale(): string
  fetch?: (request: Request) => Promise<Response>
}

async function errorCodeOf(response: Response) {
  try {
    const body = (await response.clone().json()) as { code?: unknown }
    return body.code
  } catch {
    return undefined
  }
}

const answers = async (response: Response, code: string) =>
  response.status === 401 && (await errorCodeOf(response)) === code

/**
 * Only a `401` `session.invalid` asks for a refresh; `session.reauthentication-required` and
 * `session.mfa-required` do not (7.4, 7.12).
 */
const answersSessionInvalid = (response: Response) => answers(response, 'session.invalid')

/**
 * The fetch of the portal's API link (PLAN.md 9): it sends the session cookies, the tenant and the
 * language, and answers a `401` `session.invalid` with one refresh and one retry. A refresh answered
 * `401`, or a retry refused again, signs the session out; a refresh that could not be made
 * (`unavailable`) keeps it and hands the screen the original response.
 */
export function createApiFetch(options: ApiFetchOptions) {
  const send = options.fetch ?? ((request: Request) => fetch(request))

  const withHeaders = (request: Request) => {
    const headers = new Headers(request.headers)
    if (options.tenantSlug) headers.set('x-tenant-slug', options.tenantSlug)
    headers.set('accept-language', options.locale())
    return new Request(request, { headers, credentials: 'include' })
  }

  return async (request: Request): Promise<Response> => {
    const retry = request.clone()
    const response = await send(withHeaders(request))
    if (await answers(response, 'session.mfa-required')) {
      options.onMfaRequired()
      return response
    }
    if (!(await answersSessionInvalid(response))) return response

    const result = await options.refresh().catch((): RefreshResult => 'unavailable')
    if (result === 'unavailable') return response
    if (result === 'signed-out') {
      options.onSignedOut()
      return response
    }

    const second = await send(withHeaders(retry))
    if (await answers(second, 'session.mfa-required')) options.onMfaRequired()
    else if (await answersSessionInvalid(second)) options.onSignedOut()
    return second
  }
}

/** Runs `fn` once for every caller that arrives while it is running. */
export function shared<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null
  return () => {
    running ??= fn().finally(() => {
      running = null
    })
    return running
  }
}

/**
 * Runs `fn` inside a Web Lock of that name, so the tabs of one application take turns, each with
 * the newest cookie (PLAN.md 7.4); a browser without Web Locks runs it at once.
 */
export function acrossTabs<T>(name: string, fn: () => Promise<T>): () => Promise<T> {
  return () =>
    typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(name, fn) : fn()
}

/** `POST /auth/refresh`: the cookies rotate, or the session is gone, or the answer is unknown. */
export async function requestRefresh(
  apiUrl: string,
  send: (request: Request) => Promise<Response> = (request) => fetch(request),
): Promise<RefreshResult> {
  try {
    const response = await send(
      new Request(new URL('/auth/refresh', apiUrl), { method: 'POST', credentials: 'include' }),
    )
    if (response.ok) return 'refreshed'
    return response.status === 401 ? 'signed-out' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
