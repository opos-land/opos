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
  claims: {
    sub?: string
    aud?: string
    iss?: string
    role?: string
    /** `null` leaves the exp claim out. */
    expiresIn?: string | null
    alg?: 'HS256' | 'HS512'
    /** Supabase Auth's sign-in records, `{ method, timestamp }` with the time in seconds. */
    amr?: { method: string; timestamp: number }[]
  } = {},
  key: Uint8Array = secret,
) {
  const jwt = new SignJWT({
    role: claims.role ?? 'authenticated',
    ...(claims.amr ? { amr: claims.amr } : {}),
  })
    .setProtectedHeader({ alg: claims.alg ?? 'HS256', typ: 'JWT' })
    .setSubject(claims.sub ?? randomUUID())
    .setAudience(claims.aud ?? 'authenticated')
    .setIssuer(claims.iss ?? env.AUTH_URL)
    .setIssuedAt()
  if (claims.expiresIn !== null) jwt.setExpirationTime(claims.expiresIn ?? '5m')
  return jwt.sign(key)
}

/** An unsigned token (`alg: none`) with the right claims. */
export function unsignedToken(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub, aud: 'authenticated', iss: env.AUTH_URL, iat: now, exp: now + 300 }
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`
}

const admin = async (path: string, init: RequestInit = {}, accept: number[] = []) => {
  const key = await mintToken({ role: 'service_role', aud: 'authenticated' })
  const response = await fetch(`${env.AUTH_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  })
  if (!response.ok && !accept.includes(response.status)) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`)
  }
  return response
}

/** Whether Supabase Auth still has the user. */
export async function authUserExists(id: string) {
  return (await admin(`/admin/users/${id}`, {}, [404])).ok
}

const created: string[] = []

/** A fresh address no account uses yet. */
export const testEmail = (prefix = 'api') => `${prefix}-${randomUUID().slice(0, 8)}@example.test`

/**
 * Deletes an account created outside createAccount, e.g. by a sign-up, with the others; one a test
 * deleted already is skipped.
 */
export function deleteLater(id: string) {
  created.push(id)
}

/** An account with a confirmed email, unless `confirmed` is false; a random address by default. */
export async function createAccount(
  metadata: Record<string, string> = {},
  { email = testEmail(), confirmed = true }: { email?: string; confirmed?: boolean } = {},
) {
  const response = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: confirmed,
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
    created.splice(0).map((id) => admin(`/admin/users/${id}`, { method: 'DELETE' }, [404])),
  )
}
