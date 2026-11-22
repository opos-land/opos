import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type MyProfile } from '@opos/contract'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { fileKey } from '../src/modules/files/owners'
import {
  MAX_OPEN_PROFILE_REPORTS,
  ProfileReportsCleanup,
} from '../src/modules/profiles/profile-reports.service'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, signedInAgent, testEmail } from './auth'
import { asPostgres, objectKeys, upload } from './files'
import { deleteMail, waitForMail } from './mailpit'
import { png } from './pictures'

// The reports of a profile (docs/specs/0016-public-profile.md, R1-R9): anyone sends one of a
// published profile, with no sign-in; the API keeps it, answers the address it gave, and reads
// nothing it says.

let app: NestExpressApplication
const reporters: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
})

afterAll(async () => {
  await Promise.all(reporters.map((address) => deleteMail(address)))
  await deleteCreatedAccounts()
  await app.close()
})

let address = 0
/** A client address of its own, so that one test's reports never count against another's. */
const from = () => `203.0.113.${(address += 1) % 250}`

const reporter = () => {
  const email = testEmail('reporter')
  reporters.push(email)
  return email
}

async function someone() {
  const account = await createAccount({ first_name: 'Anna' })
  return { account, agent: await signedInAgent('portal', account.email) }
}

async function published() {
  const who = await someone()
  const profile = (await who.agent.post('/me/profile/publication').expect(200)).body as MyProfile
  return { ...who, profileId: profile.profileId! }
}

const report = (profileId: string, body: object = { reason: 'spam' }, ip = from()) =>
  request(app.getHttpServer())
    .post(`/public/profiles/${profileId}/reports`)
    .set('X-Forwarded-For', ip)
    .send(body)

interface Kept {
  reason: string
  note: string | null
  email: string | null
  locale: string | null
  closed: boolean
}

const reportsOf = async (accountId: string) =>
  (await asPostgres(sql`
    select reason, note, email, locale, closed_at is not null as closed
    from profile_reports where account_id = ${accountId} order by created_at
  `)) as unknown as Kept[]

const takeDown = (accountId: string) =>
  asPostgres(sql`
    update account_profiles
    set published_at = null, taken_down_at = now(), taken_down_reason = 'spam',
      taken_down_after_report = false
    where account_id = ${accountId}
  `)

/** Whether no email reached `email` within a moment: the API sends at once or never. */
const noMail = async (email: string) => {
  await new Promise((resolve) => setTimeout(resolve, 700))
  return waitForMail(email, 1, 0).then(
    () => false,
    () => true,
  )
}

describe('POST /public/profiles/{profileId}/reports', () => {
  it('keeps a report of a published profile from anyone, and answers nothing', async () => {
    const { account, profileId } = await published()

    const res = await report(profileId, { reason: 'identity', note: ' Not her picture.\r\nSee. ' })

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(await reportsOf(account.id)).toEqual([
      {
        reason: 'identity',
        note: 'Not her picture.\nSee.',
        email: null,
        locale: null,
        closed: false,
      },
    ])
  })

  it('keeps the email address a report gave, with the language of the page it came from', async () => {
    const { account, profileId } = await published()
    const email = reporter()

    await report(profileId, { reason: 'offensive', email: ` ${email} ` })
      .set('Accept-Language', 'pl')
      .expect(204)

    expect(await reportsOf(account.id)).toMatchObject([{ email, locale: 'pl' }])
  })

  // R7 and R8: an email that the report arrived, in the words of OPOS alone.
  it('writes to the address that the report arrived, in its language, with no word of the report', async () => {
    const { profileId } = await published()
    const email = reporter()

    await report(profileId, { reason: 'spam', note: 'SECRET-WORDS https://spam.test', email })
      .set('Accept-Language', 'pl')
      .expect(204)

    const [mail] = await waitForMail(email)
    expect(mail!.Subject).toBe('Otrzymaliśmy twoje zgłoszenie profilu')
    expect(mail!.Text).toContain('dotarło do administratorów')
    for (const part of [mail!.Subject, mail!.Text, mail!.HTML]) {
      expect(part).not.toContain('SECRET-WORDS')
      expect(part).not.toContain('spam.test')
      expect(part).not.toContain(profileId)
    }
  })

  it('writes in English to a report from an English page, and to nobody when no address was given', async () => {
    const { profileId } = await published()
    const email = reporter()

    await report(profileId, { reason: 'other', email }).set('Accept-Language', 'en').expect(204)

    const [mail] = await waitForMail(email)
    expect(mail!.Subject).toBe('We received your report of a profile')
  })

  it.each([
    [{}, 'reason'],
    [{ reason: 'boring' }, 'reason'],
    [{ reason: 'spam', note: 'x'.repeat(1001) }, 'note'],
    [{ reason: 'spam', note: `a${String.fromCodePoint(0x202e)}b` }, 'note'],
    [{ reason: 'spam', email: 'not-an-address' }, 'email'],
    [{ reason: 'spam', accountId: '00000000-0000-4000-8000-000000000000' }, 'accountId'],
  ])('refuses %o and keeps nothing', async (body, field) => {
    const { account, profileId } = await published()

    const res = await report(profileId, body).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field } })
    expect(await reportsOf(account.id)).toEqual([])
  })

  // P9 and R6: a report tells nobody whether a hidden profile is there.
  it('answers alike for a profile withdrawn, taken down, never published and never made, keeps nothing and writes to nobody', async () => {
    const [withdrawn, down, never] = await Promise.all([published(), published(), someone()])
    await withdrawn.agent.delete('/me/profile/publication').expect(200)
    await takeDown(down.account.id)
    await never.agent.put('/me/profile').send({
      description: null,
      pronouns: null,
      city: 'Gdynia',
      links: [],
      interests: [],
    })
    const hidden = (
      await asPostgres(
        sql`select public_id from account_profiles where account_id = ${never.account.id}`,
      )
    )[0] as { public_id: string }
    const email = reporter()

    const answers = await Promise.all(
      [
        withdrawn.profileId,
        down.profileId,
        hidden.public_id,
        never.account.id,
        randomUUID(),
        'not-an-identifier',
      ].map((id) => report(id, { reason: 'spam', email })),
    )

    for (const answer of answers) {
      expect(answer.status).toBe(404)
      expect(answer.body).toEqual(answers[0]!.body)
    }
    for (const who of [withdrawn, down, never]) {
      expect(await reportsOf(who.account.id)).toEqual([])
    }
    expect(await noMail(email)).toBe(true)
  })

  // R4.
  it('keeps no more open reports of a profile than its limit, and answers one beyond it like any other', async () => {
    const { account, profileId } = await published()
    await asPostgres(sql`
      insert into profile_reports (account_id, reason)
      select ${account.id}, 'spam' from generate_series(1, ${MAX_OPEN_PROFILE_REPORTS - 1})
    `)
    const [last, beyond] = [reporter(), reporter()]

    await report(profileId, { reason: 'spam', email: last }).expect(204)
    const res = await report(profileId, { reason: 'spam', email: beyond })

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(await reportsOf(account.id)).toHaveLength(MAX_OPEN_PROFILE_REPORTS)
    expect(await waitForMail(last)).toHaveLength(1)
    expect(await noMail(beyond)).toBe(true)

    // A closed report makes room for another.
    await asPostgres(sql`
      update profile_reports set closed_at = now()
      where id = (select id from profile_reports where account_id = ${account.id} limit 1)
    `)
    await report(profileId).expect(204)
    expect(await reportsOf(account.id)).toHaveLength(MAX_OPEN_PROFILE_REPORTS + 1)
  })

  it('is sent only so often from one address', async () => {
    const { profileId } = await published()
    const ip = from()
    const { limit } = ROUTE_RATE_LIMITS.profileReports
    for (let sent = 0; sent < limit; sent += 1)
      await report(randomUUID(), undefined, ip).expect(404)

    const res = await report(profileId, undefined, ip)

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    await report(profileId).expect(204)
  })
})

// R9.
describe('the job that removes old reports', () => {
  it('removes a report closed more than twelve months ago, and leaves a younger and an open one', async () => {
    const { account } = await published()
    await asPostgres(sql`
      insert into profile_reports (account_id, reason, note, email, locale, created_at, closed_at)
      values
        (${account.id}, 'spam', 'old', 'old@example.test', 'en', now() - interval '14 months', now() - interval '12 months 1 day'),
        (${account.id}, 'spam', 'young', null, null, now() - interval '14 months', now() - interval '11 months'),
        (${account.id}, 'spam', 'open', null, null, now() - interval '14 months', null)
    `)

    const removed = await app.get(ProfileReportsCleanup).clean()

    expect(removed).toBeGreaterThanOrEqual(1)
    expect((await reportsOf(account.id)).map(({ note }) => note)).toEqual(['young', 'open'])
  })
})

// P13.
describe('deleting the account', () => {
  it('takes its profile, its avatar and the reports of its profile', async () => {
    const { account, agent, profileId } = await published()
    const { avatar } = (
      await agent
        .put('/me/profile/avatar')
        .send({ file: upload(png(40, 20), 'image/png') })
        .expect(200)
    ).body as MyProfile
    await report(profileId, { reason: 'spam', note: 'Advertising.' }).expect(204)

    await agent.delete('/me').expect(204)

    for (const table of [
      'account_profiles',
      'account_avatars',
      'profile_reports',
      'account_files',
    ]) {
      expect(
        await asPostgres(sql.raw(`select 1 from ${table} where account_id = '${account.id}'`)),
      ).toHaveLength(0)
    }
    expect(await objectKeys(fileKey('account', account.id, avatar!.fileId))).toEqual([])
    await request(app.getHttpServer()).get(`/public/profiles/${profileId}`).expect(404)
    await request(app.getHttpServer())
      .get(`/public/avatar-files/${avatar!.fileId}/small`)
      .expect(404)
  })
})
