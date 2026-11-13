import { sql } from 'drizzle-orm'
import { type Database } from './client'
import { totp } from './totp'

export type SignInCodeErrorCode = 'environment.not-local' | 'account.not-found' | 'mfa.not-enabled'

export class SignInCodeError extends Error {
  constructor(
    readonly code: SignInCodeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SignInCodeError'
  }
}

/** The length of the step a code lasts, in seconds, as Supabase Auth checks it. */
const STEP_SECONDS = 30

/**
 * The code the account's authenticator app shows now, and for how many seconds more: a way to sign
 * in on the local stack to an account whose secret no app holds, such as the seed's, which
 * Supabase Auth tells once.
 *
 * Anywhere else it would be a way around two-factor authentication, so it is refused before
 * anything is read unless `OPOS_ENV` is `local`, which the function reads itself: no caller hands
 * the gate its own answer. `migrationUrl()` then takes a host on the loopback interface alone. A
 * database that answers there with other people's accounts, a restored backup or a tunnel, is not
 * told apart: such a server is never labelled `local`.
 *
 * Runs as `postgres` alone, behind `pnpm db:totp`: it reads `auth.mfa_factors`, which no runtime
 * role sees.
 */
export async function signInCode(db: Database, address: string, now = Date.now()) {
  if (process.env.OPOS_ENV !== 'local') {
    throw new SignInCodeError(
      'environment.not-local',
      'A sign-in code is given where OPOS_ENV is local alone',
    )
  }
  const email = address.trim().toLowerCase()
  // An address leads to an account only once confirmed, as in every lookup by email.
  const [account] = await db.execute<{ secret: string | null }>(sql`
    select (
      select f.secret
      from auth.mfa_factors f
      where f.user_id = a.id and f.factor_type = 'totp' and f.status = 'verified'
      order by f.created_at
      limit 1
    ) as secret
    from accounts a
    where a.email = ${email} and a.email_confirmed_at is not null
  `)
  if (!account) {
    throw new SignInCodeError('account.not-found', `No confirmed account with the email ${email}`)
  }
  if (!account.secret) {
    throw new SignInCodeError(
      'mfa.not-enabled',
      `The account ${email} has two-factor authentication off`,
    )
  }
  return {
    code: totp(account.secret, now),
    secondsLeft: STEP_SECONDS - (Math.floor(now / 1000) % STEP_SECONDS),
  }
}
