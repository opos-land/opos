import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { decodeJwt } from 'jose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import {
  authUserExists,
  bindApi,
  createAccount,
  deleteCreatedAccounts,
  enableMfa,
  mintToken,
  originOf,
  session,
  signedInAgent,
  TEST_PASSWORD,
  totpCode,
} from './auth'
import { deleteMail, waitForMail } from './mailpit'
import { addRecoveryCodeHash, closeTenantDb, mfaState, recoveryCodeRows } from './tenants'

// Two-factor authentication against the real local Supabase Auth (PLAN.md 7.12, 15.1): TOTP
// factors, the recovery codes, the assurance level of the session and the email.

let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>
const addresses: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  server = app.getHttpServer()
  bindApi(server)
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await app.close()
})

const portal = originOf('portal')

/** A confirmed account and a portal browser signed in to it with the password. */
async function newPerson(metadata: Record<string, string> = {}) {
  const account = await createAccount(metadata)
  addresses.push(account.email)
  return { ...account, agent: await signedInAgent('portal', account.email) }
}

/** A person with 2FA turned on, their browser at aal2. */
async function personWith2fa(metadata: Record<string, string> = {}) {
  const person = await newPerson(metadata)
  return { ...person, ...(await enableMfa(person.agent)) }
}

/** A browser that signs in with the password only: aal1 cookies, whatever the answer. */
async function passwordBrowser(email: string) {
  const agent = request.agent(server).set('Origin', portal)
  const res = await agent.post('/auth/sign-in').send({ email, password: TEST_PASSWORD })
  return { agent, res }
}

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  return header === undefined ? [] : [header].flat()
}

const accessOf = (res: request.Response) => {
  const cookie = cookiesOf(res).find((c) => c.startsWith('opos_portal_access='))
  return cookie?.split(';')[0]?.split('=').slice(1).join('=')
}

/** The answer of `enroll`. */
const enrolledOf = (res: request.Response) =>
  res.body as { factorId: string; qrCode: string; secret: string }

/** The answer of `enable`. */
const codesOf = (res: request.Response) => (res.body as { recoveryCodes: string[] }).recoveryCodes

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const now = () => Math.floor(Date.now() / 1000)

describe('POST /auth/mfa/enroll', () => {
  it('answers the factor, a data: SVG QR code and the secret', async () => {
    const { agent } = await newPerson()

    const res = await agent.post('/auth/mfa/enroll')

    expect(res.status).toBe(200)
    const { factorId, qrCode, secret } = enrolledOf(res)
    expect(factorId).toMatch(/^[0-9a-f-]{36}$/)
    expect(qrCode).toMatch(/^data:image\/svg\+xml/)
    expect(secret).toMatch(/^[A-Z2-7]+$/)
  })

  it('needs a recent sign-in', async () => {
    const { id } = await createAccount()
    const token = await mintToken({
      sub: id,
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: now() - 3600 }],
    })

    const res = await request(server).post('/auth/mfa/enroll').use(session(token))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
  })

  it('answers 409 mfa.already-enabled on an account with 2FA', async () => {
    const { agent } = await personWith2fa()

    const res = await agent.post('/auth/mfa/enroll')

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'mfa.already-enabled' })
  })

  it('replaces a stale unverified factor', async () => {
    const { agent, id } = await newPerson()
    const first = await agent.post('/auth/mfa/enroll').expect(200)

    const second = await agent.post('/auth/mfa/enroll').expect(200)

    expect(enrolledOf(second).factorId).not.toBe(enrolledOf(first).factorId)
    expect((await mfaState(id)).factors).toBe(1)
  })

  it('refuses a request without a session', async () => {
    const res = await request(server).post('/auth/mfa/enroll').set('Origin', portal)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })
})

describe('POST /auth/mfa/enable', () => {
  it('refuses a factorId of another account and leaves that factor alone', async () => {
    const owner = await newPerson()
    const stranger = await newPerson()
    const { factorId, secret } = enrolledOf(await owner.agent.post('/auth/mfa/enroll').expect(200))

    const res = await stranger.agent
      .post('/auth/mfa/enable')
      .send({ factorId, code: totpCode(secret) })

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'request.not-found' })
    expect(await mfaState(owner.id)).toEqual({ mirrored: false, factors: 1 })
    expect(await recoveryCodeRows(stranger.id)).toHaveLength(0)
  })

  it('refuses a factorId nobody holds', async () => {
    const { agent } = await newPerson()

    const res = await agent
      .post('/auth/mfa/enable')
      .send({ factorId: '5f0c9a4e-3a55-4b9a-8e0c-7b8f1f1b2c3d', code: '123456' })

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'request.not-found' })
  })

  it('with a right code sets aal2 and returns ten codes once', async () => {
    const { agent, id } = await newPerson()
    const { factorId, secret } = enrolledOf(await agent.post('/auth/mfa/enroll').expect(200))

    const res = await agent.post('/auth/mfa/enable').send({ factorId, code: totpCode(secret) })

    expect(res.status).toBe(200)
    expect(codesOf(res)).toHaveLength(10)
    expect(new Set(codesOf(res)).size).toBe(10)
    for (const code of codesOf(res)) expect(code).toMatch(/^[A-Z2-7]{16}$/)
    expect(decodeJwt(accessOf(res)!)).toMatchObject({ aal: 'aal2' })
    const me = await agent.get('/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ id, mfaEnabled: true })
  })

  it('answers 409 mfa.already-enabled when 2FA is on, with no new codes', async () => {
    const { agent, id, factorId } = await personWith2fa()
    const before = await recoveryCodeRows(id)

    const res = await agent.post('/auth/mfa/enable').send({ factorId, code: '123456' })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'mfa.already-enabled' })
    expect(res.body).not.toHaveProperty('recoveryCodes')
    expect(await recoveryCodeRows(id)).toEqual(before)
  })

  it('answers 400 mfa.code-invalid for a wrong code, sets no aal2 and leaves 2FA off', async () => {
    const { agent, id } = await newPerson()
    const { factorId, secret } = enrolledOf(await agent.post('/auth/mfa/enroll').expect(200))
    const wrong = totpCode(secret) === '000000' ? '000001' : '000000'

    const res = await agent.post('/auth/mfa/enable').send({ factorId, code: wrong })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'mfa.code-invalid' })
    expect(JSON.stringify(res.body)).not.toContain(wrong)
    expect(accessOf(res)).toBeUndefined()
    expect((await mfaState(id)).mirrored).toBe(false)
  })

  it('stores the codes hashed: no plaintext in account_recovery_codes', async () => {
    const { id, recoveryCodes } = await personWith2fa()

    const rows = await recoveryCodeRows(id)

    expect(rows.map((row) => row.code_hash).sort()).toEqual(recoveryCodes.map(sha256).sort())
    for (const row of rows) {
      expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(recoveryCodes).not.toContain(row.code_hash)
      expect(row.used_at).toBeNull()
    }
  })

  it('replaces the unused codes an account still holds', async () => {
    const { agent, id } = await newPerson()
    await addRecoveryCodeHash(id, sha256('LEFTOVERLEFTOVER'))
    const { factorId, secret } = enrolledOf(await agent.post('/auth/mfa/enroll').expect(200))

    const res = await agent.post('/auth/mfa/enable').send({ factorId, code: totpCode(secret) })

    expect(res.status).toBe(200)
    const rows = await recoveryCodeRows(id)
    expect(rows).toHaveLength(10)
    expect(rows.map((row) => row.code_hash)).not.toContain(sha256('LEFTOVERLEFTOVER'))
  })

  it('never hands out codes that are not stored, when two enables race', async () => {
    for (let round = 0; round < 5; round++) {
      const { agent, id } = await newPerson()
      const { factorId, secret } = enrolledOf(await agent.post('/auth/mfa/enroll').expect(200))
      const code = totpCode(secret)

      const answers = await Promise.all([
        agent.post('/auth/mfa/enable').send({ factorId, code }),
        agent.post('/auth/mfa/enable').send({ factorId, code }),
      ])

      const stored = new Set((await recoveryCodeRows(id)).map((row) => row.code_hash))
      const successes = answers.filter((res) => res.status === 200)
      // Supabase Auth may refuse the second of two challenges of one factor at once with a 503.
      for (const res of answers) {
        expect([200, 409, 503], `round ${round}`).toContain(res.status)
        if (res.status === 409) expect(res.body).toMatchObject({ code: 'mfa.already-enabled' })
      }
      for (const res of successes) {
        for (const returned of codesOf(res)) {
          expect(stored.has(sha256(returned)), `round ${round}`).toBe(true)
        }
      }
      expect((await mfaState(id)).mirrored).toBe(true)
    }
  }, 30_000)

  it('an access token from before enable loses access at once', async () => {
    const { agent, email } = await newPerson()
    const before = await request(server)
      .post('/auth/sign-in')
      .set('Origin', portal)
      .send({ email, password: TEST_PASSWORD })
    const token = accessOf(before)!
    await request(server).get('/me').use(session(token)).expect(200)

    await enableMfa(agent)

    const res = await request(server).get('/me').use(session(token))
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.mfa-required' })
  })
})

describe('POST /auth/mfa/verify', () => {
  it('with a right code raises the session to aal2, and refresh keeps it', async () => {
    const { email, secret } = await personWith2fa()
    const { agent, res: signedIn } = await passwordBrowser(email)
    expect(signedIn.status).toBe(401)
    expect(signedIn.body).toMatchObject({ code: 'session.mfa-required' })
    expect((await agent.get('/me')).status).toBe(401)

    const verified = await agent.post('/auth/mfa/verify').send({ code: totpCode(secret, 1) })

    expect(verified.status).toBe(204)
    expect(decodeJwt(accessOf(verified)!)).toMatchObject({ aal: 'aal2' })
    expect((await agent.get('/me')).status).toBe(200)

    const refreshed = await agent.post('/auth/refresh')

    expect(refreshed.status).toBe(204)
    expect(decodeJwt(accessOf(refreshed)!)).toMatchObject({ aal: 'aal2' })
    expect((await agent.get('/me')).status).toBe(200)
  })

  it('with a wrong code answers 400 mfa.code-invalid and stays at aal1', async () => {
    const { email, secret } = await personWith2fa()
    const { agent } = await passwordBrowser(email)
    const wrong = totpCode(secret, 1) === '000000' ? '000001' : '000000'

    const res = await agent.post('/auth/mfa/verify').send({ code: wrong })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'mfa.code-invalid' })
    expect(accessOf(res)).toBeUndefined()
    expect((await agent.get('/me')).status).toBe(401)
  })

  it('refuses a code from an hour ago', async () => {
    const { email, secret } = await personWith2fa()
    const { agent } = await passwordBrowser(email)

    const res = await agent.post('/auth/mfa/verify').send({ code: totpCode(secret, -120) })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'mfa.code-invalid' })
  })

  // Pinned, not wished for: Supabase Auth accepts a code again within its own 30 second step
  // (PLAN.md 7.12). A Supabase Auth upgrade that changes this should be noticed here.
  it('accepts a code a second time within its step', async () => {
    const { email, secret } = await personWith2fa()
    const code = totpCode(secret, 1)
    // Verifying ends the other sessions below aal2, so the second browser signs in afterwards.
    const first = await passwordBrowser(email)
    const once = await first.agent.post('/auth/mfa/verify').send({ code })
    const second = await passwordBrowser(email)
    const again = await second.agent.post('/auth/mfa/verify').send({ code })

    expect(once.status).toBe(204)
    expect(again.status).toBe(204)
  })

  it('answers 409 mfa.not-required at aal2 and on an account without 2FA', async () => {
    const withTwoFactor = await personWith2fa()
    const without = await newPerson()

    const atAal2 = await withTwoFactor.agent.post('/auth/mfa/verify').send({ code: '123456' })
    const plain = await without.agent.post('/auth/mfa/verify').send({ code: '123456' })

    for (const res of [atAal2, plain]) {
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'mfa.not-required' })
    }
  })

  it('takes six digits and nothing else', async () => {
    const { agent } = await newPerson()

    const res = await agent.post('/auth/mfa/verify').send({ code: 'abcdef' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })
})

describe('the shared limit', () => {
  // Turning 2FA on is the first attempt: enable shares the counter with verify and recover.
  it('answers 429 request.rate-limited on the eleventh attempt in 15 minutes', async () => {
    const { email } = await personWith2fa()
    const { agent } = await passwordBrowser(email)

    for (let attempt = 2; attempt <= 10; attempt++) {
      const res = await agent.post('/auth/mfa/verify').send({ code: '000000' })
      expect(res.status, `attempt ${attempt}`).toBe(400)
    }
    const eleventh = await agent.post('/auth/mfa/verify').send({ code: '000000' })

    expect(eleventh.status).toBe(429)
    expect(eleventh.body).toMatchObject({ code: 'request.rate-limited' })
    expect(Number(eleventh.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('is shared by recover and not spent by another account', async () => {
    const spender = await personWith2fa()
    const other = await personWith2fa()
    const spent = await passwordBrowser(spender.email)
    const bystander = await passwordBrowser(other.email)

    for (let attempt = 2; attempt <= 10; attempt++) {
      await spent.agent.post('/auth/mfa/recover').send({ code: 'AAAAAAAAAAAAAAAA' }).expect(400)
    }
    const limited = await spent.agent.post('/auth/mfa/verify').send({ code: '000000' })
    const free = await bystander.agent.post('/auth/mfa/verify').send({ code: '000000' })

    expect(limited.status).toBe(429)
    expect(free.status).toBe(400)
    expect(free.body).toMatchObject({ code: 'mfa.code-invalid' })
  })
})

describe('POST /auth/mfa/recover', () => {
  it('consumes a code once, removes the factor and clears the mirror', async () => {
    const { id, email, recoveryCodes } = await personWith2fa()
    const { agent } = await passwordBrowser(email)

    const res = await agent.post('/auth/mfa/recover').send({ code: recoveryCodes[3] })

    expect(res.status).toBe(204)
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 0 })
    const rows = await recoveryCodeRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code_hash: sha256(recoveryCodes[3]!) })
    expect(rows[0]!.used_at).not.toBeNull()
  })

  it('ends the other sessions of the account, and keeps the one that recovered', async () => {
    const { agent: other, email, recoveryCodes } = await personWith2fa()
    const { agent } = await passwordBrowser(email)
    expect((await other.get('/me')).status).toBe(200)

    await agent.post('/auth/mfa/recover').send({ code: recoveryCodes[0] }).expect(204)

    const refreshed = await other.post('/auth/refresh')
    expect(refreshed.status).toBe(401)
    expect(refreshed.body).toMatchObject({ code: 'session.invalid' })
    expect((await agent.get('/me')).status).toBe(200)
    expect((await agent.post('/auth/refresh')).status).toBe(204)
  })

  it('reads a code as typed, in groups and in lower case', async () => {
    const { id, email, recoveryCodes } = await personWith2fa()
    const { agent } = await passwordBrowser(email)
    const typed = recoveryCodes[0]!.toLowerCase().replace(/(.{4})(?=.)/g, '$1-')

    await agent.post('/auth/mfa/recover').send({ code: typed }).expect(204)

    expect((await mfaState(id)).mirrored).toBe(false)
  })

  it('refuses a used code', async () => {
    const first = await personWith2fa()
    const browser = await passwordBrowser(first.email)
    await browser.agent.post('/auth/mfa/recover').send({ code: first.recoveryCodes[0] }).expect(204)
    // Two-factor authentication back on: the spent code must not work again.
    await enableMfa(await signedInAgent('portal', first.email))
    const returning = await passwordBrowser(first.email)

    const used = await returning.agent
      .post('/auth/mfa/recover')
      .send({ code: first.recoveryCodes[0] })

    expect(used.status).toBe(400)
    expect(used.body).toMatchObject({ code: 'mfa.code-invalid' })
    expect((await mfaState(first.id)).mirrored).toBe(true)
  })

  it('refuses an unused code of another account, and leaves it unused', async () => {
    const owner = await personWith2fa()
    const stranger = await personWith2fa()
    const strangerBrowser = await passwordBrowser(stranger.email)

    const foreign = await strangerBrowser.agent
      .post('/auth/mfa/recover')
      .send({ code: owner.recoveryCodes[1] })

    expect(foreign.status).toBe(400)
    expect(foreign.body).toMatchObject({ code: 'mfa.code-invalid' })
    expect((await mfaState(stranger.id)).mirrored).toBe(true)
    const rows = await recoveryCodeRows(owner.id)
    expect(rows).toHaveLength(10)
    expect(rows.every((row) => row.used_at === null)).toBe(true)
    expect(await recoveryCodeRows(stranger.id)).toHaveLength(10)
  })

  it('answers 409 mfa.not-required at aal2 and on an account without 2FA', async () => {
    const withTwoFactor = await personWith2fa()
    const without = await newPerson()

    const atAal2 = await withTwoFactor.agent
      .post('/auth/mfa/recover')
      .send({ code: withTwoFactor.recoveryCodes[0] })
    const plain = await without.agent.post('/auth/mfa/recover').send({ code: 'AAAAAAAAAAAAAAAA' })

    for (const res of [atAal2, plain]) {
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'mfa.not-required' })
    }
    expect((await mfaState(withTwoFactor.id)).mirrored).toBe(true)
  })

  it('sends the email in the account locale', async () => {
    const polish = await personWith2fa({ locale: 'pl' })
    const english = await personWith2fa({ locale: 'en' })
    const [pl, en] = await Promise.all([
      passwordBrowser(polish.email),
      passwordBrowser(english.email),
    ])

    await pl.agent.post('/auth/mfa/recover').send({ code: polish.recoveryCodes[0] }).expect(204)
    await en.agent.post('/auth/mfa/recover').send({ code: english.recoveryCodes[0] }).expect(204)

    const [plMail] = await waitForMail(polish.email)
    const [enMail] = await waitForMail(english.email)
    expect(plMail!.Subject).toBe('Uwierzytelnianie dwuskładnikowe zostało wyłączone')
    expect(enMail!.Subject).toBe('Two-factor authentication was turned off')
    for (const mail of [plMail!, enMail!]) {
      expect(mail.Text).not.toMatch(/[A-Z2-7]{16}/)
    }
  })
})

describe('DELETE /auth/mfa', () => {
  it('needs aal2', async () => {
    const { id, email } = await personWith2fa()
    const { agent } = await passwordBrowser(email)

    const res = await agent.delete('/auth/mfa')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.mfa-required' })
    expect((await mfaState(id)).mirrored).toBe(true)
  })

  it('needs a recent sign-in', async () => {
    const { id } = await personWith2fa()
    const token = await mintToken({
      sub: id,
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: now() - 3600 },
        { method: 'totp', timestamp: now() - 3500 },
      ],
    })

    const res = await request(server).delete('/auth/mfa').use(session(token))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
    expect((await mfaState(id)).mirrored).toBe(true)
  })

  it('removes the factors and the unused codes, and sends the email in the account locale', async () => {
    const { agent, id, email } = await personWith2fa({ locale: 'pl' })

    const res = await agent.delete('/auth/mfa')

    expect(res.status).toBe(204)
    expect(await mfaState(id)).toEqual({ mirrored: false, factors: 0 })
    expect(await recoveryCodeRows(id)).toHaveLength(0)
    const [mail] = await waitForMail(email)
    expect(mail!.Subject).toBe('Uwierzytelnianie dwuskładnikowe zostało wyłączone')
  })

  it('ends the other sessions of the account, and keeps the one that turned 2FA off', async () => {
    const { agent: other, email, secret } = await personWith2fa()
    const { agent } = await passwordBrowser(email)
    await agent
      .post('/auth/mfa/verify')
      .send({ code: totpCode(secret, 1) })
      .expect(204)

    await agent.delete('/auth/mfa').expect(204)

    const refreshed = await other.post('/auth/refresh')
    expect(refreshed.status).toBe(401)
    expect(refreshed.body).toMatchObject({ code: 'session.invalid' })
    expect((await agent.get('/me')).status).toBe(200)
    expect((await agent.post('/auth/refresh')).status).toBe(204)
  })

  it('answers 404 mfa.not-enabled for an account with no factor', async () => {
    const { agent } = await newPerson()

    const res = await agent.delete('/auth/mfa')

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'mfa.not-enabled' })
  })
})

describe('DELETE /me with 2FA', () => {
  it('works at aal2, and removes the factors and codes with the user', async () => {
    const { agent, id } = await personWith2fa()
    expect(await recoveryCodeRows(id)).toHaveLength(10)

    const res = await agent.delete('/me')

    expect(res.status).toBe(204)
    expect(await authUserExists(id)).toBe(false)
    expect(await recoveryCodeRows(id)).toHaveLength(0)
    expect((await mfaState(id)).factors).toBe(0)
  })
})
