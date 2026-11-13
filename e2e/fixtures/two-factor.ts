import { totp } from '@opos/db/totp'
import { type Account, passwordGrant } from './auth-admin'
import { stack } from './stack'

// Two-factor authentication turned on through the API, as the portal's account page does: a
// scenario about something else starts from an account that has it.

/** The cookies a browser of the portal would hold, kept across the calls. */
function portalSession(access: string, refresh: string) {
  const cookies = new Map([
    ['opos_portal_access', access],
    ['opos_portal_refresh', refresh],
  ])
  return async (path: string, body?: unknown) => {
    const response = await fetch(new URL(path, stack.api), {
      method: 'POST',
      headers: {
        origin: new URL(stack.portal).origin,
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';')
      const separator = pair.indexOf('=')
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
    return (await response.json()) as unknown
  }
}

/** Turns two-factor authentication on for the account and answers the secret of its factor. */
export async function turnOnTwoFactor(account: Pick<Account, 'email' | 'password'>) {
  const grant = await passwordGrant(account.email, account.password)
  if (!grant.access_token || !grant.refresh_token) {
    throw new Error(`sign-in of ${account.email}: ${grant.status}`)
  }
  const call = portalSession(grant.access_token, grant.refresh_token)
  const { factorId, secret } = (await call('/auth/mfa/enroll')) as {
    factorId: string
    secret: string
  }
  await call('/auth/mfa/enable', { factorId, code: totp(secret, Date.now()) })
  return secret
}
