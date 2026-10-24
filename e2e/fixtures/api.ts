import { passwordGrant } from './auth-admin'
import { stack } from './stack'

// A direct request to the API, as a client other than the panel or the portal would send it
// (PLAN.md 5).

export async function accessToken(email: string, password: string) {
  const grant = await passwordGrant(email, password)
  if (!grant.access_token) throw new Error(`sign-in of ${email}: ${grant.status}`)
  return grant.access_token
}

export async function callApi(
  path: string,
  {
    token,
    tenantSlug,
    method = 'GET',
    body,
  }: { token?: string; tenantSlug?: string; method?: string; body?: unknown } = {},
) {
  const response = await fetch(new URL(path, stack.api), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as unknown }
}
