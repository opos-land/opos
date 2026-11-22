import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  type AdminProfile,
  type AdminProfileReport,
  CONTACT_EMAIL,
  type MyProfile,
} from '@opos/contract'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, signedInAgent, testEmail } from './auth'
import {
  adminAccount,
  adminHeaders,
  closeAdminDb,
  countLoggedActions,
  loggedActions,
  sessionToken,
} from './admins'
import { asPostgres, upload } from './files'
import { deleteMail, waitForMail } from './mailpit'
import { png } from './pictures'

// What an admin does about a profile (docs/specs/0016-public-profile.md, T1-T14): reads its
// reports, closes one, takes the profile down and restores it, and clears an account's name. Each
// leaves its entry in the log and tells the people it concerns.

let app: NestExpressApplication
let admin: Awaited<ReturnType<typeof adminAccount>>
let token: string
const addresses: string[] = []

const api = () => request(app.getHttpServer())
const asAdmin = (req: request.Test) => req.set(adminHeaders(token))

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
  admin = await adminAccount({ first_name: 'Ada', last_name: 'Admin' })
  token = await sessionToken(admin.id)
})

afterAll(async () => {
  await Promise.all(addresses.map(deleteMail))
  await deleteCreatedAccounts()
  await closeAdminDb()
  await app.close()
})

let address = 0
const from = () => `192.0.2.${(address += 1) % 250}`

const held = {
  description: 'Game master.',
  pronouns: 'she/her',
  city: 'Gdynia',
  links: ['https://example.test/me'],
  interests: ['larp'],
}

async function someone(
  metadata: Record<string, string> = { first_name: 'Anna', last_name: 'Nowak', locale: 'en' },
) {
  const account = await createAccount(metadata)
  addresses.push(account.email)
  return { account, agent: await signedInAgent('portal', account.email) }
}

/** An account with a published profile that holds something, and the identifier of its page. */
async function published(metadata?: Record<string, string>) {
  const who = await someone(metadata)
  await who.agent.put('/me/profile').send(held).expect(200)
  const profile = (await who.agent.post('/me/profile/publication').expect(200)).body as MyProfile
  return { ...who, profileId: profile.profileId! }
}

const reporter = () => {
  const email = testEmail('reporter')
  addresses.push(email)
  return email
}

const report = (profileId: string, body: object = { reason: 'spam' }, language = 'en') =>
  api()
    .post(`/public/profiles/${profileId}/reports`)
    .set('X-Forwarded-For', from())
    .set('Accept-Language', language)
    .send(body)
    .expect(204)

const reportsOf = async (accountId: string) =>
  ((await asAdmin(api().get(`/admin/profiles/${accountId}`)).expect(200)).body as AdminProfile)
    .reports

const takeDown = (accountId: string, body: object = { reason: 'spam' }) =>
  asAdmin(api().post(`/admin/profiles/${accountId}/take-down`)).send(body)
const restore = (accountId: string) => asAdmin(api().post(`/admin/profiles/${accountId}/restore`))
const clearName = (accountId: string, body: object = { reason: 'offensive' }) =>
  asAdmin(api().post(`/admin/accounts/${accountId}/clear-name`)).send(body)

const actionsAbout = async (accountId: string) =>
  (await loggedActions({ accountId })).map(({ action, admin_account_id }) => ({
    action,
    by: admin_account_id,
  }))

describe('the reports of profiles', () => {
  it('lists the open ones, the newest first, with what each says and whose profile it is of', async () => {
    const { account, agent, profileId } = await published()
    await agent.patch('/me').send({ nickname: 'Lisek' }).expect(200)
    const email = reporter()
    await report(profileId, { reason: 'identity', note: 'Not her picture.', email })
    await report(profileId, { reason: 'spam' })

    const res = await asAdmin(api().get('/admin/profile-reports').query({ limit: 100 })).expect(200)

    const mine = (res.body as (AdminProfileReport & { account: object })[]).filter(
      (listed) => listed.accountId === account.id,
    )
    expect(mine).toMatchObject([
      { reason: 'spam', note: null, email: null, closedAt: null },
      {
        reason: 'identity',
        note: 'Not her picture.',
        email,
        closedAt: null,
        account: {
          firstName: 'Anna',
          nickname: 'Lisek',
          lastName: 'Nowak',
          nameOrder: 'nickname-middle',
        },
      },
    ])
    expect(Date.parse(mine[0]!.createdAt)).toBeGreaterThanOrEqual(Date.parse(mine[1]!.createdAt))
  })

  it('lists the closed ones when asked, and reads on before a report', async () => {
    const { account, profileId } = await published()
    for (let sent = 0; sent < 3; sent += 1) await report(profileId)
    const [newest, middle, oldest] = await reportsOf(account.id)
    await asAdmin(api().post(`/admin/profile-reports/${middle!.id}/close`)).expect(200)

    const closed = (
      await asAdmin(api().get('/admin/profile-reports').query({ state: 'closed', limit: 100 }))
    ).body as AdminProfileReport[]
    const open = (await asAdmin(api().get('/admin/profile-reports').query({ limit: 100 })))
      .body as AdminProfileReport[]
    const older = (
      await asAdmin(api().get('/admin/profile-reports').query({ before: newest!.id, limit: 100 }))
    ).body as AdminProfileReport[]

    expect(closed.map(({ id }) => id)).toContain(middle!.id)
    expect(open.map(({ id }) => id)).toEqual(expect.arrayContaining([newest!.id, oldest!.id]))
    expect(open.map(({ id }) => id)).not.toContain(middle!.id)
    expect(older.map(({ id }) => id)).toContain(oldest!.id)
    expect(older.map(({ id }) => id)).not.toContain(newest!.id)
  })

  it.each([{ state: 'all' }, { limit: 0 }, { limit: 101 }, { before: 'yesterday' }])(
    'answers 400 for %o',
    async (query) => {
      expect((await asAdmin(api().get('/admin/profile-reports').query(query))).status).toBe(400)
    },
  )

  it('shows one report, and finds none under an identifier that names none', async () => {
    const { account, profileId } = await published()
    await report(profileId, { reason: 'offensive', note: 'Look.' })
    const [kept] = await reportsOf(account.id)

    const res = await asAdmin(api().get(`/admin/profile-reports/${kept!.id}`)).expect(200)

    expect(res.body).toMatchObject({
      id: kept!.id,
      accountId: account.id,
      reason: 'offensive',
      note: 'Look.',
    })
    const none = await asAdmin(api().get(`/admin/profile-reports/${randomUUID()}`))
    expect(none.status).toBe(404)
    expect(none.body).toMatchObject({ code: 'request.not-found' })
  })

  // R7 and T12.
  it('closes a report: the profile stays, the log gains an entry and who sent it hears of it', async () => {
    const { account, profileId } = await published()
    const email = reporter()
    await report(profileId, { reason: 'spam', email }, 'pl')
    const [kept] = await reportsOf(account.id)

    const res = await asAdmin(api().post(`/admin/profile-reports/${kept!.id}/close`)).expect(200)

    expect(res.body).toMatchObject({ report: { id: kept!.id }, emailSent: true })
    expect((res.body as { report: AdminProfileReport }).report.closedAt).not.toBeNull()
    await api().get(`/public/profiles/${profileId}`).expect(200)
    expect(await actionsAbout(account.id)).toEqual([
      { action: 'profile-report.close', by: admin.id },
    ])
    const mails = await waitForMail(email, 2)
    expect(mails.map((mail) => mail.Subject).sort()).toEqual([
      'Otrzymaliśmy twoje zgłoszenie profilu',
      'Zgłoszony profil zostaje',
    ])
    expect(mails.map((mail) => mail.Text).join('\n')).toContain(CONTACT_EMAIL)
  })

  it('changes nothing when a closed report is closed again', async () => {
    const { account, profileId } = await published()
    await report(profileId)
    const [kept] = await reportsOf(account.id)
    const first = await asAdmin(api().post(`/admin/profile-reports/${kept!.id}/close`)).expect(200)
    const entries = await countLoggedActions()

    const again = await asAdmin(api().post(`/admin/profile-reports/${kept!.id}/close`)).expect(200)

    // A report that gave no address has nobody to tell.
    expect(first.body).toMatchObject({ emailSent: null })
    expect(again.body).toMatchObject({ emailSent: null })
    expect((again.body as { report: AdminProfileReport }).report.closedAt).toBe(
      (first.body as { report: AdminProfileReport }).report.closedAt,
    )
    expect(await countLoggedActions()).toBe(entries)
  })
})

describe('GET /admin/profiles/{accountId}', () => {
  // T2.
  it('shows a profile as it is now: the name, the avatar, what it holds, its state and its reports', async () => {
    const { account, agent, profileId } = await published()
    const mine = (
      await agent
        .put('/me/profile/avatar')
        .send({ file: upload(png(40, 20), 'image/png') })
        .expect(200)
    ).body as MyProfile
    await report(profileId, { reason: 'spam', note: 'Advertising.' })

    const res = await asAdmin(api().get(`/admin/profiles/${account.id}`)).expect(200)

    expect(res.body).toMatchObject({
      accountId: account.id,
      email: account.email,
      firstName: 'Anna',
      nickname: null,
      lastName: 'Nowak',
      nameOrder: 'nickname-middle',
      profileId,
      published: true,
      avatar: mine.avatar,
      takedown: null,
      ...held,
      reports: [{ reason: 'spam', note: 'Advertising.', closedAt: null }],
    })
  })

  it('shows an account with no profile with an empty one, and finds no account under another identifier', async () => {
    const { account } = await someone()

    const res = await asAdmin(api().get(`/admin/profiles/${account.id}`)).expect(200)

    expect(res.body).toMatchObject({
      accountId: account.id,
      email: account.email,
      profileId: null,
      published: false,
      avatar: null,
      takedown: null,
      description: null,
      links: [],
      interests: [],
      reports: [],
    })
    expect((await asAdmin(api().get(`/admin/profiles/${randomUUID()}`))).status).toBe(404)
  })
})

// T14.
describe('POST /admin/accounts/find', () => {
  const find = (email: string) => asAdmin(api().post('/admin/accounts/find')).send({ email })

  it('finds an account by its email address, however it is typed, and leaves no entry', async () => {
    const { account } = await someone()
    const entries = await countLoggedActions()

    const res = await find(` ${account.email.toUpperCase()} `.trim()).expect(200)

    expect(res.body).toEqual({ accountId: account.id })
    expect(await countLoggedActions()).toBe(entries)
  })

  it('finds none under an address no account uses', async () => {
    const res = await find(testEmail('nobody'))

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'account.not-found' })
  })

  // An address leads to an account only once confirmed: whoever signed up under someone else's
  // address is not reached by it, and no email about that account goes to the address.
  it('opens no account whose email address is not confirmed', async () => {
    const stranger = await createAccount({ first_name: 'Not' }, { confirmed: false })

    const res = await find(stranger.email)

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'account.unconfirmed' })
    expect(JSON.stringify(res.body)).not.toContain(stranger.id)
  })
})

describe('taking a profile down', () => {
  // T3-T5 and R7.
  it('withdraws it at once, removes its avatar, closes its open reports and tells the account and who reported it', async () => {
    const { account, agent, profileId } = await published({ first_name: 'Anna', locale: 'pl' })
    const { avatar } = (
      await agent
        .put('/me/profile/avatar')
        .send({ file: upload(png(40, 20), 'image/png') })
        .expect(200)
    ).body as MyProfile
    const email = reporter()
    await report(profileId, { reason: 'identity', email })
    await report(profileId, { reason: 'spam' })

    const res = await takeDown(account.id, {
      reason: 'identity',
      note: ' The picture shows someone else. ',
    }).expect(200)

    expect(res.body).toMatchObject({
      emailSent: true,
      profile: {
        accountId: account.id,
        published: false,
        profileId: null,
        avatar: null,
        takedown: {
          reason: 'identity',
          note: 'The picture shows someone else.',
          afterReport: true,
          reviewRequested: false,
        },
        // What the profile holds stays: the admin changes nothing it says.
        ...held,
      },
    })
    expect((res.body as { profile: AdminProfile }).profile.reports.every((r) => r.closedAt)).toBe(
      true,
    )
    await api().get(`/public/profiles/${profileId}`).expect(404)
    await api().get(`/public/avatar-files/${avatar!.fileId}/small`).expect(404)
    expect((await agent.get('/me/profile')).body).toMatchObject({
      published: false,
      avatar: null,
      takedown: { reason: 'identity', note: 'The picture shows someone else.', afterReport: true },
    })
    expect(await actionsAbout(account.id)).toEqual([{ action: 'profile.take-down', by: admin.id }])

    const [told] = await waitForMail(account.email)
    expect(told!.Subject).toBe('Twój profil został zdjęty')
    expect(told!.Text).toContain('regulamin OPOS nie pozwala, by profil pokazywał cudze zdjęcie')
    expect(told!.Text).toContain('Decyzję poprzedziło zgłoszenie')
    expect(told!.Text).toContain('Decyzję podjął człowiek')
    expect(told!.Text).toContain('> The picture shows someone else.')
    expect(told!.Text).toContain(CONTACT_EMAIL)
    const outcome = (await waitForMail(email, 2)).map((mail) => mail.Subject)
    expect(outcome).toContain('The profile you reported was taken down')
  })

  it('says that no report came first, of a profile nobody reported', async () => {
    const { account } = await published()

    const res = await takeDown(account.id, { reason: 'offensive' }).expect(200)

    expect(res.body).toMatchObject({
      profile: { takedown: { reason: 'offensive', note: null, afterReport: false } },
    })
    const [told] = await waitForMail(account.email)
    expect(told!.Subject).toBe('Your profile was taken down')
    expect(told!.Text).toContain('with no report')
    expect(told!.Text).not.toContain('The administrator wrote')
  })

  it('takes down a profile that was never published, so that it cannot be', async () => {
    const { account, agent } = await someone()
    await agent.put('/me/profile').send(held).expect(200)

    await takeDown(account.id).expect(200)

    expect((await agent.post('/me/profile/publication')).body).toMatchObject({
      code: 'profile.taken-down',
    })
  })

  it.each([
    [{}, 'reason'],
    [{ reason: 'other' }, 'reason'],
    [{ reason: 'spam', note: 'x'.repeat(501) }, 'note'],
  ])('refuses %o', async (body, field) => {
    const { account, profileId } = await published()

    const res = await takeDown(account.id, body).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field } })
    await api().get(`/public/profiles/${profileId}`).expect(200)
  })

  it('finds no profile of an account that has none, and none of an account that is not there', async () => {
    const { account } = await someone()

    for (const id of [account.id, randomUUID()]) {
      const res = await takeDown(id)
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'request.not-found' })
    }
    expect(await actionsAbout(account.id)).toEqual([])
  })

  it('changes nothing when a profile taken down is taken down again', async () => {
    const { account } = await published()
    await takeDown(account.id, { reason: 'spam', note: 'First.' }).expect(200)
    const entries = await countLoggedActions()

    const again = await takeDown(account.id, { reason: 'offensive', note: 'Second.' }).expect(200)

    expect(again.body).toMatchObject({
      emailSent: null,
      profile: { takedown: { reason: 'spam', note: 'First.' } },
    })
    expect(await countLoggedActions()).toBe(entries)
    expect(await waitForMail(account.email)).toHaveLength(1)
  })
})

describe('the profiles taken down', () => {
  // T7 and T8.
  it('lists them, those asking for a review first', async () => {
    const [waiting, asking] = await Promise.all([published(), published()])
    await takeDown(waiting.account.id).expect(200)
    await takeDown(asking.account.id, { reason: 'offensive' }).expect(200)
    await asking.agent.post('/me/profile/review-request').expect(200)

    const res = await asAdmin(api().get('/admin/profiles')).expect(200)

    const listed = res.body as { accountId: string; reviewRequestedAt: string | null }[]
    const places = [asking, waiting].map((who) =>
      listed.findIndex((row) => row.accountId === who.account.id),
    )
    expect(places[0]).toBeGreaterThanOrEqual(0)
    expect(places[1]).toBeGreaterThan(places[0]!)
    expect(listed[places[0]!]).toMatchObject({
      email: asking.account.email,
      firstName: 'Anna',
      reason: 'offensive',
    })
    expect(listed[places[0]!]!.reviewRequestedAt).not.toBeNull()
    expect(listed[places[1]!]!.reviewRequestedAt).toBeNull()
    // No row is asked for after one that asks for nothing.
    const firstSilent = listed.findIndex((row) => row.reviewRequestedAt === null)
    expect(listed.slice(firstSilent).every((row) => row.reviewRequestedAt === null)).toBe(true)
  })

  it('lists no profile that is not taken down', async () => {
    const { account } = await published()

    const listed = (await asAdmin(api().get('/admin/profiles')).expect(200)).body as {
      accountId: string
    }[]

    expect(listed.map((row) => row.accountId)).not.toContain(account.id)
  })
})

describe('restoring a profile', () => {
  // T9.
  it('lets it be published again and publishes nothing itself', async () => {
    const { account, agent, profileId } = await published()
    await takeDown(account.id).expect(200)
    await agent.post('/me/profile/review-request').expect(200)

    const res = await restore(account.id).expect(200)

    expect(res.body).toMatchObject({
      emailSent: true,
      profile: { published: false, profileId: null, takedown: null, ...held },
    })
    await api().get(`/public/profiles/${profileId}`).expect(404)
    expect(await actionsAbout(account.id)).toEqual([
      { action: 'profile.take-down', by: admin.id },
      { action: 'profile.restore', by: admin.id },
    ])
    const subjects = (await waitForMail(account.email, 2)).map((mail) => mail.Subject)
    expect(subjects).toContain('Your profile can be published again')

    // The account publishes it, under the identifier it had.
    const again = (await agent.post('/me/profile/publication').expect(200)).body as MyProfile
    expect(again.profileId).toBe(profileId)
    await api().get(`/public/profiles/${profileId}`).expect(200)
  })

  it('changes nothing for a profile that is not taken down, and finds none of an account that has none', async () => {
    const [{ account }, bare] = await Promise.all([published(), someone()])
    const entries = await countLoggedActions()

    const res = await restore(account.id).expect(200)

    expect(res.body).toMatchObject({ emailSent: null, profile: { published: true } })
    expect(await countLoggedActions()).toBe(entries)
    expect((await restore(bare.account.id)).status).toBe(404)
  })
})

describe('clearing the name of an account', () => {
  // T10.
  it('takes the three parts away, blocks nothing and tells the account under which rule', async () => {
    const { account, agent } = await someone()
    await agent.patch('/me').send({ nickname: 'Lisek', nameOrder: 'nickname-last' }).expect(200)

    const res = await clearName(account.id, { reason: 'offensive' }).expect(200)

    expect(res.body).toMatchObject({
      emailSent: true,
      profile: { accountId: account.id, firstName: null, nickname: null, lastName: null },
    })
    expect((await agent.get('/me')).body).toMatchObject({
      firstName: null,
      nickname: null,
      lastName: null,
      // The order is the account's choice, not a part of the name.
      nameOrder: 'nickname-last',
    })
    expect(await actionsAbout(account.id)).toEqual([{ action: 'account.clear-name', by: admin.id }])
    const [told] = await waitForMail(account.email)
    expect(told!.Subject).toBe('The name of your account was cleared')
    expect(told!.Text).toContain('do not allow an offensive, hateful or unlawful name')
    expect(told!.Text).toContain(CONTACT_EMAIL)

    // The account gives itself a name again.
    await agent.patch('/me').send({ firstName: 'Ania' }).expect(200)
  })

  it('clears the name of a profile that is published, which then shows no part of a name', async () => {
    const { account, profileId } = await published()

    await clearName(account.id).expect(200)

    expect((await api().get(`/public/profiles/${profileId}`).expect(200)).body).toMatchObject({
      firstName: null,
      nickname: null,
      lastName: null,
    })
  })

  it('changes nothing for an account with no part of a name', async () => {
    const { account } = await someone({})
    const entries = await countLoggedActions()

    const res = await clearName(account.id).expect(200)

    expect(res.body).toMatchObject({ emailSent: null })
    expect(await countLoggedActions()).toBe(entries)
  })

  it('refuses another reason, and finds no account under an identifier that names none', async () => {
    const { account } = await someone()

    expect((await clearName(account.id, { reason: 'other' })).status).toBe(400)
    expect((await clearName(account.id, {})).status).toBe(400)
    expect((await clearName(randomUUID())).status).toBe(404)
    expect(
      (await asPostgres(sql`select first_name from accounts where id = ${account.id}`))[0],
    ).toEqual({ first_name: 'Anna' })
  })
})
