import { migrationDb, migrationUrl } from '@opos/db'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { AuthAdminClient } from '../src/modules/auth/auth-admin.client'
import { SupabaseAuthFactory } from '../src/modules/auth/supabase-auth.factory'
import { MailService } from '../src/modules/mail/mail.service'
import { ResetError, resetTwoFactor } from '../src/scripts/reset-two-factor'
import { createApp } from './app'
import {
  bindApi,
  createAccount,
  deleteCreatedAccounts,
  enableMfa,
  originOf,
  signedInAgent,
  TEST_PASSWORD,
  testEmail,
} from './auth'
import { deleteMail, waitForMail } from './mailpit'
import {
  addRecoveryCodeHash,
  addVerifiedFactor,
  closeTenantDb,
  mfaState,
  recoveryCodeRows,
} from './tenants'

// `pnpm db:account:reset-2fa` (PLAN.md 14): what an admin runs for a person who lost both the
// device and the recovery codes. It works as postgres and on the admin API, with no session.

const env = loadEnv()
const db = migrationDb(migrationUrl())
const admin = new AuthAdminClient(new SupabaseAuthFactory(env))
const mail = new MailService(env)
const deps = { db, admin, mail }

let app: NestExpressApplication
const addresses: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await db.$client.end()
  await app.close()
})

async function personWith2fa(metadata: Record<string, string> = {}) {
  const account = await createAccount(metadata)
  addresses.push(account.email)
  const agent = await signedInAgent('portal', account.email)
  return { ...account, ...(await enableMfa(agent)) }
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('resetTwoFactor', () => {
  it('removes the factors and the unused codes, and mails the account in its locale', async () => {
    const { id, email } = await personWith2fa({ locale: 'pl' })

    const result = await resetTwoFactor(deps, email)

    expect(result).toMatchObject({ accountId: id, factors: 1, emailSent: true })
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 0 })
    expect(await recoveryCodeRows(id)).toHaveLength(0)
    const [sent] = await waitForMail(email)
    expect(sent!.Subject).toBe('Uwierzytelnianie dwuskładnikowe zostało wyłączone')
  })

  it.each([
    ['pl', 'Uwierzytelnianie dwuskładnikowe zostało wyłączone'],
    ['en', 'Two-factor authentication was turned off'],
  ])('mails an account that chose no locale in the sign-up locale %s', async (locale, subject) => {
    const account = await createAccount({ locale })
    addresses.push(account.email)
    const agent = await signedInAgent('portal', account.email)
    await enableMfa(agent)
    await agent.patch('/me').send({ locale: null }).expect(200)

    await resetTwoFactor(deps, account.email)

    const [sent] = await waitForMail(account.email)
    expect(sent!.Subject).toBe(subject)
  })

  it('keeps the codes already used, as a record', async () => {
    const { id, email, recoveryCodes } = await personWith2fa()
    const browser = await signedInBrowserAt1(email)
    await browser.post('/auth/mfa/recover').send({ code: recoveryCodes[0] }).expect(204)
    const again = await signedInAgent('portal', email)
    await enableMfa(again)
    expect(await recoveryCodeRows(id)).toHaveLength(11)

    await resetTwoFactor(deps, email)

    const rows = await recoveryCodeRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.used_at).not.toBeNull()
  })

  it('matches the address case-insensitively', async () => {
    const { id, email } = await personWith2fa()

    await resetTwoFactor(deps, `  ${email.toUpperCase()} `)

    expect((await mfaState(id)).mirrored).toBe(false)
  })

  it('refuses an unknown address with account.not-found, leaving another account alone', async () => {
    const bystander = await personWith2fa()

    const failure = await failureOf(resetTwoFactor(deps, testEmail('nobody')))

    expect(failure).toBeInstanceOf(ResetError)
    expect(failure).toMatchObject({ code: 'account.not-found' })
    expect(await mfaState(bystander.id)).toEqual({ mirrored: true, factors: 1 })
    expect(await recoveryCodeRows(bystander.id)).toHaveLength(10)
  })

  it('refuses an unconfirmed account with account.unconfirmed, changing nothing', async () => {
    const { id, email } = await createAccount({}, { confirmed: false })
    await addRecoveryCodeHash(id, 'c'.repeat(64))

    const failure = await failureOf(resetTwoFactor(deps, email))

    expect(failure).toMatchObject({ code: 'account.unconfirmed' })
    expect(await recoveryCodeRows(id)).toHaveLength(1)
  })

  it('refuses an account with no factor with mfa.not-enabled, sending nothing', async () => {
    const { email } = await createAccount()
    addresses.push(email)

    const failure = await failureOf(resetTwoFactor(deps, email))

    expect(failure).toMatchObject({ code: 'mfa.not-enabled' })
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(waitForMail(email, 1, 500)).rejects.toThrow(/no email/)
  })

  it('refuses an account with only an unverified factor, as 2FA is not on, and removes nothing', async () => {
    const { id, email } = await createAccount()
    addresses.push(email)
    await addVerifiedFactor(id, 'unverified')

    const failure = await failureOf(resetTwoFactor(deps, email))

    expect(failure).toMatchObject({ code: 'mfa.not-enabled' })
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 1 })
    await expect(waitForMail(email, 1, 500)).rejects.toThrow(/no email/)
  })

  it('leaves the codes of an account with no factor where they are', async () => {
    const { id, email } = await createAccount()
    addresses.push(email)
    await addRecoveryCodeHash(id, 'd'.repeat(64))

    const failure = await failureOf(resetTwoFactor(deps, email))

    expect(failure).toMatchObject({ code: 'mfa.not-enabled' })
    const rows = await recoveryCodeRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code_hash: 'd'.repeat(64), used_at: null })
  })

  /** The database, whose `delete` fails as a query of Drizzle does: the query in its message. */
  const failingDelete = (id: string) =>
    new Proxy(db, {
      get: (target, property) =>
        property === 'delete'
          ? () => {
              throw new Error(`Failed query: delete from codes\nparams: ${id}`, {
                cause: new Error('codes store down'),
              })
            }
          : (Reflect.get(target, property) as unknown),
    })

  it('reports the removal and the notice when removing the codes fails after the factors are gone', async () => {
    const { id, email } = await personWith2fa()

    const result = await resetTwoFactor({ ...deps, db: failingDelete(id) }, email)

    expect(result).toEqual({
      accountId: id,
      factors: 1,
      emailSent: true,
      codesError: 'codes store down',
    })
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 0 })
    expect(await waitForMail(email)).toHaveLength(1)
  })

  it('reports both when the codes and the email fail', async () => {
    const { id, email } = await personWith2fa()
    const failing = { sendNoticeEmail: () => Promise.reject(new Error('smtp down')) }

    const result = await resetTwoFactor({ ...deps, db: failingDelete(id), mail: failing }, email)

    expect(result).toMatchObject({
      factors: 1,
      emailSent: false,
      emailError: 'smtp down',
      codesError: 'codes store down',
    })
  })

  it('reports a failed email and leaves the removal standing', async () => {
    const { id, email } = await personWith2fa()
    const failing = {
      sendNoticeEmail: () => Promise.reject(new Error('smtp down')),
    }

    const result = await resetTwoFactor({ ...deps, mail: failing }, email)

    expect(result).toMatchObject({ factors: 1, emailSent: false, emailError: 'smtp down' })
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 0 })
  })
})

/** A browser of the portal that signed in with the password only: aal1. */
async function signedInBrowserAt1(email: string) {
  const agent = request.agent(app.getHttpServer()).set('Origin', originOf('portal'))
  await agent.post('/auth/sign-in').send({ email, password: TEST_PASSWORD })
  return agent
}
