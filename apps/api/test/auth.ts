import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { loadEnv } from '../src/config/env'

// Test accounts go through the real Supabase Auth: the admin API creates them and the password
// grant signs them in (PLAN.md 15.1).

const env = loadEnv()
const secret = new TextEncoder().encode(env.JWT_SECRET)
export const TEST_PASSWORD = 'test-password-123'

/** A JWT shaped like Supabase Auth's, with any claim overridden. */
export async function mintToken(
  claims: { sub?: string; aud?: string; iss?: string; role?: string; expiresIn?: string } = {},
  key: Uint8Array = secret,
) {
  return new SignJWT({ role: claims.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub ?? randomUUID())
    .setAudience(claims.aud ?? 'authenticated')
    .setIssuer(claims.iss ?? env.AUTH_URL)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? '5m')
    .sign(key)
}

const admin = async (path: string, init: RequestInit = {}) => {
  const key = await mintToken({ role: 'service_role', aud: 'authenticated' })
  const response = await fetch(`${env.AUTH_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response
}

const created: string[] = []

export async function createAccount(metadata: Record<string, string> = {}) {
  const email = `api-${randomUUID().slice(0, 8)}@example.test`
  const response = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    }),
  })
  const { id } = (await response.json()) as { id: string }
  created.push(id)
  return { id, email }
}

export async function signIn(email: string, password = TEST_PASSWORD) {
  const response = await fetch(`${env.AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(`sign-in: ${response.status} ${await response.text()}`)
  return ((await response.json()) as { access_token: string }).access_token
}

export async function deleteCreatedAccounts() {
  await Promise.all(
    created.splice(0).map((id) => admin(`/admin/users/${id}`, { method: 'DELETE' })),
  )
}
