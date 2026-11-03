import { type Database, accountRecoveryCodes, accounts } from '@opos/db'
import { mfaDisabledEmail } from '@opos/i18n/emails'
import { and, eq, isNull } from 'drizzle-orm'
import { type AuthAdminClient } from '../modules/auth/auth-admin.client'
import { type MailService } from '../modules/mail/mail.service'
import { recipientLocale } from '../modules/mail/recipient-locale'

/** Why a reset changed nothing (PLAN.md 14): the codes the script exits with. */
export type ResetErrorCode = 'account.not-found' | 'account.unconfirmed' | 'mfa.not-enabled'

export class ResetError extends Error {
  constructor(
    readonly code: ResetErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ResetError'
  }
}

/** What the reset works on: the `postgres` role's connection, the admin API and the mail transport. */
export interface ResetDeps {
  db: Database
  admin: Pick<AuthAdminClient, 'factorIds' | 'deleteFactor'>
  mail: Pick<MailService, 'sendNoticeEmail'>
}

export interface ResetResult {
  accountId: string
  /** How many factors the admin API removed. */
  factors: number
  /** `false` when the email failed; the removal stands all the same. */
  emailSent: boolean
  /** Why the email failed, for the admin to see; absent when it was sent. */
  emailError?: string
}

/**
 * Removes the factors and the unused recovery codes of the account with this address, for a
 * person who lost both the device and the codes (PLAN.md 7.12, 14), and sends them the notice of
 * `recover`. The address is matched case-insensitively against a confirmed account. A refusal
 * changes nothing. Nothing the person could use to sign in is printed or logged.
 */
export async function resetTwoFactor(deps: ResetDeps, address: string): Promise<ResetResult> {
  const email = address.trim().toLowerCase()
  const [account] = await deps.db
    .select({
      id: accounts.id,
      locale: accounts.locale,
      emailConfirmedAt: accounts.emailConfirmedAt,
      mfaEnabledAt: accounts.mfaEnabledAt,
    })
    .from(accounts)
    .where(eq(accounts.email, email))
  if (!account) throw new ResetError('account.not-found', `No account with the email ${email}`)
  if (!account.emailConfirmedAt) {
    throw new ResetError(
      'account.unconfirmed',
      `The account with the email ${email} is not confirmed`,
    )
  }

  // 2FA is on when a verified factor exists, which the mirror says; a leftover unverified factor
  // is not 2FA (PLAN.md 7.12), and a reset of that account would tell a person a lie.
  const factorIds = account.mfaEnabledAt ? await deps.admin.factorIds(account.id) : []
  if (factorIds.length === 0) {
    throw new ResetError(
      'mfa.not-enabled',
      `The account with the email ${email} has no verified factor`,
    )
  }
  for (const factorId of factorIds) await deps.admin.deleteFactor(account.id, factorId)
  // The factors are gone, so the person is told whatever happens to the codes.
  let codesFailure: Error | undefined
  try {
    await deps.db
      .delete(accountRecoveryCodes)
      .where(
        and(eq(accountRecoveryCodes.accountId, account.id), isNull(accountRecoveryCodes.usedAt)),
      )
  } catch (error) {
    codesFailure = error instanceof Error ? error : new Error(String(error))
  }

  let result: ResetResult
  try {
    await deps.mail.sendNoticeEmail({
      to: email,
      locale: recipientLocale({ account: account.locale }),
      content: mfaDisabledEmail,
    })
    result = { accountId: account.id, factors: factorIds.length, emailSent: true }
  } catch (error) {
    result = {
      accountId: account.id,
      factors: factorIds.length,
      emailSent: false,
      emailError: error instanceof Error ? error.message : 'unknown error',
    }
  }
  if (codesFailure) throw codesFailure
  return result
}
