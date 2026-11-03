import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import request from 'supertest'
import { type CryptoKey, generateKeyPair, importJWK, type JWK, SignJWT } from 'jose'
import { type Application } from '../src/common/http/application'
import { authUrl, loadEnv } from '../src/config/env'

// Test accounts go through the real Supabase Auth: the admin API creates them and the password
// grant signs them in (PLAN.md 15.1).

const env = loadEnv()
const auth = authUrl(env)
export const TEST_PASSWORD = 'test-password-123'

/** The stack's own signing key, which pnpm infra:init wrote and Supabase Auth signs with. */
const [localKey] = JSON.parse(
  readFileSync(new URL('../../../supabase/signing_keys.json', import.meta.url), 'utf8'),
) as JWK[]
if (!localKey?.kid) throw new Error('supabase/signing_keys.json holds no key; run pnpm infra:init')
const localKid = localKey.kid
// The file's key names `verify` too, which WebCrypto refuses on a private key.
const signingKey = (await importJWK({ ...localKey, key_ops: ['sign'] }, 'ES256')) as CryptoKey

/** A key Supabase Auth never saw; mintToken signs with it under the stack's own `kid`. */
export const foreignKey = async () => (await generateKeyPair('ES256')).privateKey

/** A JWT shaped like Supabase Auth's, with any claim overridden. */
export async function mintToken(
  claims: {
    sub?: string
    aud?: string
    iss?: string
    role?: string
    /** `null` leaves the exp claim out. */
    expiresIn?: string | null
    alg?: 'ES256' | 'HS256'
    is_anonymous?: boolean
    /** Supabase Auth's sign-in records, `{ method, timestamp }` with the time in seconds. */
    amr?: { method: string; timestamp: number }[]
    /** Supabase Auth's `app_metadata.providers`: `email`, `google`. */
    providers?: string[]
    /** Supabase Auth's assurance level: `aal2` after the second factor. */
    aal?: 'aal1' | 'aal2'
  } = {},
  key: CryptoKey | Uint8Array = signingKey,
) {
  const jwt = new SignJWT({
    role: claims.role ?? 'authenticated',
    ...(claims.amr ? { amr: claims.amr } : {}),
    ...(claims.aal ? { aal: claims.aal } : {}),
    ...(claims.providers ? { app_metadata: { providers: claims.providers } } : {}),
    ...(claims.is_anonymous === undefined ? {} : { is_anonymous: claims.is_anonymous }),
  })
    .setProtectedHeader({ alg: claims.alg ?? 'ES256', typ: 'JWT', kid: localKid })
    .setSubject(claims.sub ?? randomUUID())
    .setAudience(claims.aud ?? 'authenticated')
    .setIssuer(claims.iss ?? auth)
    .setIssuedAt()
  if (claims.expiresIn !== null) jwt.setExpirationTime(claims.expiresIn ?? '5m')
  return jwt.sign(key)
}

/** An unsigned token (`alg: none`) with the right claims. */
export function unsignedToken(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub, aud: 'authenticated', iss: auth, iat: now, exp: now + 300 }
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`
}

/** The admin API takes the secret key on `apikey` and no `Authorization` (PLAN.md 10). */
const admin = async (path: string, init: RequestInit = {}, accept: number[] = []) => {
  const response = await fetch(`${auth}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY, 'content-type': 'application/json' },
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
  const response = await fetch(`${auth}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(`sign-in: ${response.status} ${await response.text()}`)
  return ((await response.json()) as { access_token: string }).access_token
}

let apiServer: Parameters<typeof request>[0] | undefined

/** The API under test, which signedInAgent signs in to; a file calls it once in beforeAll. */
export function bindApi(server: Parameters<typeof request>[0]) {
  apiServer = server
}

/** The Origin of an application, as a browser sends it. */
export const originOf = (app: Application) =>
  new URL(app === 'portal' ? env.PORTAL_URL : env.PANEL_URL).origin

/**
 * The headers the portal's browser sends for `token`: its access cookie and the portal's Origin.
 * The API reads no other credential (PLAN.md 7.4).
 */
export const sessionHeaders = (token: string) => ({
  origin: originOf('portal'),
  cookie: `opos_portal_access=${token}`,
})

/** The same for supertest's `.use()`. */
export const session =
  (token: string) => (req: { set(headers: Record<string, string>): unknown }) =>
    req.set(sessionHeaders(token))

/**
 * A supertest agent signed in to `app` through `POST /auth/sign-in`: it holds the session cookies
 * the API set and sends the application's Origin with every request (PLAN.md 15.1).
 */
export async function signedInAgent(app: Application, email: string, password = TEST_PASSWORD) {
  if (!apiServer) throw new Error('bindApi(app.getHttpServer()) first')
  const agent = request.agent(apiServer).set('Origin', originOf(app))
  const res = await agent.post('/auth/sign-in').send({ email, password })
  if (res.status !== 200) throw new Error(`sign-in: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

/**
 * Removes the accounts the file created, ten at a time: each deletion holds a connection of
 * Supabase Auth, and a file with a hundred accounts would otherwise use up the database's.
 */
export async function deleteCreatedAccounts() {
  const ids = created.splice(0)
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(
      ids.slice(i, i + 10).map((id) => admin(`/admin/users/${id}`, { method: 'DELETE' }, [404])),
    )
  }
}
