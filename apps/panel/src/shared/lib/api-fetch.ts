/** What the API link needs from the session; the panel backs it with auth-js. */
export interface ApiSession {
  /** The current access token, or null when signed out. */
  accessToken(): Promise<string | null>
  /** A refreshed access token, or null when the session cannot be refreshed. */
  refresh(): Promise<string | null>
  signOut(): Promise<void>
}

export interface ApiFetchOptions {
  session: ApiSession
  /** Sent as X-Tenant-Slug; the API ignores it on routes outside a tenant (PLAN.md 7.2). */
  tenantSlug?: string
  /** The active interface language, sent as Accept-Language. */
  locale(): string
  fetch?: (request: Request) => Promise<Response>
}

/** `DELETE /me` asks for a fresh sign-in; a refresh keeps the old one, so it is no cure (7.4). */
async function asksForSignIn(response: Response) {
  try {
    const body = (await response.clone().json()) as { code?: unknown }
    return body.code === 'session.reauthentication-required'
  } catch {
    return false
  }
}

function withHeaders(request: Request, options: ApiFetchOptions, token: string | null) {
  const headers = new Headers(request.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (options.tenantSlug) headers.set('x-tenant-slug', options.tenantSlug)
  headers.set('accept-language', options.locale())
  return new Request(request, { headers })
}

/**
 * The fetch of the panel's API link (PLAN.md 8): it attaches the access token, the tenant and the
 * language, and answers a `401` with one refresh and one retry. A refresh that fails, or a retry
 * that is refused again, signs the session out.
 */
export function createApiFetch(options: ApiFetchOptions) {
  const send = options.fetch ?? ((request: Request) => fetch(request))

  return async (request: Request): Promise<Response> => {
    const token = await options.session.accessToken()
    const retry = token ? request.clone() : null
    const response = await send(withHeaders(request, options, token))
    if (response.status !== 401 || !retry || (await asksForSignIn(response))) return response

    const fresh = await options.session.refresh().catch(() => null)
    if (!fresh) {
      await options.session.signOut()
      return response
    }
    const second = await send(withHeaders(retry, options, fresh))
    if (second.status === 401 && !(await asksForSignIn(second))) await options.session.signOut()
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
