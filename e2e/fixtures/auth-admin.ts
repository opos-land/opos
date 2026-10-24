import { randomUUID } from 'node:crypto'
import { stack } from './stack'

// Accounts a scenario starts from are made through Supabase Auth's admin API with the API's
// service role key (PLAN.md 10, Admin API), as the seed makes them.

export const PASSWORD = 'e2e-password-123'

async function admin(path: string, init: RequestInit = {}, accept: number[] = []) {
  const response = await fetch(`${stack.auth}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${stack.serviceRoleKey}`,
      'content-type': 'application/json',
    },
  })
  if (!response.ok && !accept.includes(response.status)) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`)
  }
  return response
}

/** A fresh address no account uses, on a domain that never receives real mail. */
export const freshEmail = (prefix = 'e2e') => `${prefix}-${randomUUID().slice(0, 8)}@example.test`

export interface Account {
  id: string
  email: string
  password: string
}

/** An account with a password, confirmed unless `confirmed` is false. */
export async function createAuthUser({
  email = freshEmail(),
  password = PASSWORD,
  confirmed = true,
  metadata = {},
}: {
  email?: string
  password?: string
  confirmed?: boolean
  metadata?: Record<string, string>
} = {}): Promise<Account> {
  const response = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: confirmed, user_metadata: metadata }),
  })
  const { id } = (await response.json()) as { id: string }
  return { id, email, password }
}

export async function deleteAuthUser(id: string) {
  await admin(`/admin/users/${id}`, { method: 'DELETE' }, [404])
}

/** Supabase Auth's password grant, the way a browser signs in, without one. */
export async function passwordGrant(email: string, password: string) {
  const response = await fetch(`${stack.auth}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    error_code?: string
  }
  return { status: response.status, ...body }
}

/** Supabase Auth's refresh grant: whether a session can still be extended. */
export async function refreshGrant(refreshToken: string) {
  const response = await fetch(`${stack.auth}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  return response.status
}
