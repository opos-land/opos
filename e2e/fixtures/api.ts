import { passwordGrant } from './auth-admin'
import { stack } from './stack'

// A direct request to the API, as an application would send it once signed in (PLAN.md 7.4): the
// access token in the cookie of the application, with the application's Origin. The API reads
// nothing else.

export async function accessToken(email: string, password: string) {
  const grant = await passwordGrant(email, password)
  if (!grant.access_token) throw new Error(`sign-in of ${email}: ${grant.status}`)
  return grant.access_token
}

export async function callApi(
  path: string,
  {
    token,
    app = 'panel',
    tenantSlug,
    method = 'GET',
    body,
  }: {
    token?: string
    app?: 'panel' | 'portal'
    tenantSlug?: string
    method?: string
    body?: unknown
  } = {},
) {
  const response = await fetch(new URL(path, stack.api), {
    method,
    headers: {
      ...(token
        ? { cookie: `opos_${app}_access=${token}`, origin: new URL(stack[app]).origin }
        : {}),
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as unknown }
}
