import { type NestExpressApplication } from '@nestjs/platform-express'
import { type MyProfile } from '@opos/contract'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileKey } from '../src/modules/files/owners'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, signedInAgent } from './auth'
import { asPostgres, objectKeys, upload } from './files'
import { pdf, png, pngChunk } from './pictures'

// The profile of the session's account (docs/specs/0016-public-profile.md): what it holds, its
// publication, its avatar and the request for a review of a takedown.

let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  bindApi(app.getHttpServer())
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await app.close()
})

const empty = {
  profileId: null,
  published: false,
  avatar: null,
  takedown: null,
  description: null,
  pronouns: null,
  city: null,
  links: [],
  interests: [],
}

const content = { description: null, pronouns: null, city: null, links: [], interests: [] }

/** A signed-in account of the portal, with its agent. */
async function someone() {
  const account = await createAccount()
  return { account, agent: await signedInAgent('portal', account.email) }
}

const picture = (name = 'me.png') => upload(png(40, 20), 'image/png', name)

/** Takes the profile of an account down, as an admin does. */
const takeDown = (accountId: string) =>
  asPostgres(sql`
    update account_profiles
    set published_at = null, taken_down_at = now(), taken_down_reason = 'spam',
      taken_down_note = 'Advertising.', taken_down_after_report = true
    where account_id = ${accountId}
  `)

const rowOf = async (accountId: string) =>
  (
    await asPostgres(sql`
      select public_id, published_at, review_requested_at from account_profiles
      where account_id = ${accountId}
    `)
  )[0] as { public_id: string; published_at: Date | null; review_requested_at: Date | null }

describe('GET /me/profile', () => {
  it('answers an empty, private profile for an account that has none yet, and keeps no row for it', async () => {
    const { account, agent } = await someone()

    const res = await agent.get('/me/profile').expect(200)

    expect(res.body).toEqual(empty)
    expect(await rowOf(account.id)).toBeUndefined()
  })
})

describe('PUT /me/profile', () => {
  it('keeps what the profile holds, and clears it again', async () => {
    const { agent } = await someone()
    const held = {
      description: 'Game master.\nSince 2010.',
      pronouns: 'she/her',
      city: 'Gdynia',
      links: ['https://example.test/me', 'https://other.test/?a=1&b=2'],
      interests: ['larp', 'tabletop-rpg'],
    }

    const res = await agent
      .put('/me/profile')
      .send({ ...held, description: ' Game master.\r\nSince 2010. ', city: ' Gdynia ' })
      .expect(200)

    expect(res.body).toEqual({ ...empty, ...held })
    expect((await agent.get('/me/profile')).body).toEqual({ ...empty, ...held })
    expect((await agent.put('/me/profile').send(content).expect(200)).body).toEqual(empty)
  })

  it.each([
    [{ description: 'x'.repeat(501) }, 'description'],
    [{ description: `a${String.fromCodePoint(0x202e)}b` }, 'description'],
    [{ pronouns: 'x'.repeat(31) }, 'pronouns'],
    [{ city: 'x'.repeat(81) }, 'city'],
    [{ links: ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test'] }, 'links'],
    [{ links: ['http://a.test'] }, 'links.0'],
    [{ links: ['javascript:alert(1)'] }, 'links.0'],
    [{ links: ['https://user:secret@a.test'] }, 'links.0'],
    [{ links: [`https://a.test/${'x'.repeat(190)}`] }, 'links.0'],
    [{ interests: ['knitting'] }, 'interests.0'],
    [{ interests: ['larp', 'larp'] }, 'interests'],
    [{ published: true }, 'published'],
    [{ profileId: '00000000-0000-4000-8000-000000000000' }, 'profileId'],
  ])('refuses %o', async (change, field) => {
    const { account, agent } = await someone()

    const res = await agent
      .put('/me/profile')
      .send({ ...content, ...change })
      .expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field } })
    expect(await rowOf(account.id)).toBeUndefined()
  })

  it('changes the profile of the session account alone', async () => {
    const [a, b] = await Promise.all([someone(), someone()])
    await b.agent
      .put('/me/profile')
      .send({ ...content, city: 'Sopot' })
      .expect(200)

    await a.agent
      .put('/me/profile')
      .send({ ...content, city: 'Gdynia' })
      .expect(200)

    expect((await b.agent.get('/me/profile')).body).toMatchObject({ city: 'Sopot' })
  })
})

describe('publishing and withdrawing', () => {
  it('publishes a profile under an identifier that is not the account’s, and keeps it across a withdrawal', async () => {
    const { account, agent } = await someone()
    await agent
      .put('/me/profile')
      .send({ ...content, city: 'Gdynia' })
      .expect(200)

    const published = (await agent.post('/me/profile/publication').expect(200)).body as MyProfile
    expect(published).toMatchObject({ published: true, city: 'Gdynia' })
    expect(published.profileId).toMatch(/^[0-9a-f-]{36}$/)
    expect(published.profileId).not.toBe(account.id)

    const withdrawn = (await agent.delete('/me/profile/publication').expect(200)).body as MyProfile
    expect(withdrawn).toMatchObject({ published: false, profileId: null, city: 'Gdynia' })

    const again = (await agent.post('/me/profile/publication').expect(200)).body as MyProfile
    expect(again.profileId).toBe(published.profileId)
  })

  it('publishes a profile that holds nothing, and changes nothing when it is published twice', async () => {
    const { account, agent } = await someone()

    const first = (await agent.post('/me/profile/publication').expect(200)).body as MyProfile
    const since = (await rowOf(account.id)).published_at
    const second = (await agent.post('/me/profile/publication').expect(200)).body as MyProfile

    expect(first).toMatchObject({ ...empty, published: true, profileId: first.profileId })
    expect(second).toEqual(first)
    expect((await rowOf(account.id)).published_at).toEqual(since)
  })

  it('withdraws a profile that was never published without a complaint', async () => {
    const { agent } = await someone()

    expect((await agent.delete('/me/profile/publication').expect(200)).body).toEqual(empty)
  })

  it('refuses to publish a profile taken down, and says what the takedown says', async () => {
    const { account, agent } = await someone()
    await agent.post('/me/profile/publication').expect(200)
    await takeDown(account.id)

    const res = await agent.post('/me/profile/publication').expect(409)

    expect(res.body).toMatchObject({ code: 'profile.taken-down' })
    const profile = (await agent.get('/me/profile')).body as MyProfile
    expect(profile).toMatchObject({
      published: false,
      profileId: null,
      takedown: {
        reason: 'spam',
        note: 'Advertising.',
        afterReport: true,
        reviewRequested: false,
      },
    })
    expect(Date.parse(profile.takedown!.at)).toBeGreaterThan(Date.now() - 60_000)
  })

  it('lets an account whose profile is taken down keep changing it', async () => {
    const { account, agent } = await someone()
    await agent
      .put('/me/profile')
      .send({ ...content, city: 'Gdynia' })
      .expect(200)
    await takeDown(account.id)

    const res = await agent
      .put('/me/profile')
      .send({ ...content, city: 'Sopot' })
      .expect(200)

    expect(res.body).toMatchObject({ city: 'Sopot', takedown: { reason: 'spam' } })
  })
})

describe('POST /me/profile/review-request', () => {
  it('asks for a review of a takedown, once', async () => {
    const { account, agent } = await someone()
    await agent.post('/me/profile/publication').expect(200)
    await takeDown(account.id)

    const res = await agent.post('/me/profile/review-request').expect(200)
    const asked = (await rowOf(account.id)).review_requested_at
    await agent.post('/me/profile/review-request').expect(200)

    expect(res.body).toMatchObject({ takedown: { reviewRequested: true } })
    expect(asked).not.toBeNull()
    expect((await rowOf(account.id)).review_requested_at).toEqual(asked)
  })

  it.each(['has no profile', 'has a profile that is not taken down'])(
    'refuses an account that %s',
    async (state) => {
      const { agent } = await someone()
      if (state !== 'has no profile') await agent.post('/me/profile/publication').expect(200)

      const res = await agent.post('/me/profile/review-request').expect(409)

      expect(res.body).toMatchObject({ code: 'profile.not-taken-down' })
    },
  )
})

describe('the avatar', () => {
  const keysOf = (accountId: string, fileId: string) =>
    objectKeys(fileKey('account', accountId, fileId))

  const fileRows = (accountId: string) =>
    asPostgres(sql`select id, kind, name from account_files where account_id = ${accountId}`)

  it('is kept for an account with no profile yet, under a label that is not the name it came with', async () => {
    const { account, agent } = await someone()

    const res = await agent
      .put('/me/profile/avatar')
      .send({ file: picture('Anna Nowak 2026.png') })
      .expect(200)

    const profile = res.body as MyProfile
    expect(profile).toMatchObject({ ...empty, avatar: { fileId: profile.avatar!.fileId } })
    expect(await fileRows(account.id)).toEqual([
      { id: profile.avatar!.fileId, kind: 'profile-avatar', name: 'avatar' },
    ])
    const key = fileKey('account', account.id, profile.avatar!.fileId)
    expect(await keysOf(account.id, profile.avatar!.fileId)).toEqual([
      `${key}large`,
      `${key}master`,
    ])
  })

  it('is replaced by a new one: the old file goes, row and bytes', async () => {
    const { account, agent } = await someone()
    const first = (await agent.put('/me/profile/avatar').send({ file: picture() }).expect(200))
      .body as MyProfile

    const second = (await agent.put('/me/profile/avatar').send({ file: picture() }).expect(200))
      .body as MyProfile

    expect(second.avatar!.fileId).not.toBe(first.avatar!.fileId)
    expect(await fileRows(account.id)).toHaveLength(1)
    expect(await keysOf(account.id, first.avatar!.fileId)).toEqual([])
    expect(await keysOf(account.id, second.avatar!.fileId)).toHaveLength(2)
  })

  it('takes uploads sent at once one after another: each is answered and one avatar stays', async () => {
    const { account, agent } = await someone()

    const answers = await Promise.all(
      Array.from({ length: 4 }, () => agent.put('/me/profile/avatar').send({ file: picture() })),
    )

    expect(answers.map((res) => res.status)).toEqual([200, 200, 200, 200])
    const rows = await fileRows(account.id)
    expect(rows).toHaveLength(1)
    expect((await agent.get('/me/profile')).body).toMatchObject({
      avatar: { fileId: rows[0]!.id },
    })
  })

  it('is removed, and removing none changes nothing', async () => {
    const { account, agent } = await someone()
    const kept = (await agent.put('/me/profile/avatar').send({ file: picture() }).expect(200))
      .body as MyProfile

    await agent.delete('/me/profile/avatar').expect(204)
    await agent.delete('/me/profile/avatar').expect(204)

    expect((await agent.get('/me/profile')).body).toMatchObject({ avatar: null })
    expect(await fileRows(account.id)).toEqual([])
    expect(await keysOf(account.id, kept.avatar!.fileId)).toEqual([])
  })

  it('stays with a profile that is published and withdrawn', async () => {
    const { agent } = await someone()
    const kept = (await agent.put('/me/profile/avatar').send({ file: picture() }).expect(200))
      .body as MyProfile

    await agent.post('/me/profile/publication').expect(200)
    const withdrawn = (await agent.delete('/me/profile/publication').expect(200)).body as MyProfile

    expect(withdrawn.avatar).toEqual(kept.avatar)
  })

  it('is taken while the profile is taken down', async () => {
    const { account, agent } = await someone()
    await agent.post('/me/profile/publication').expect(200)
    await takeDown(account.id)

    const res = await agent.put('/me/profile/avatar').send({ file: picture() }).expect(200)

    expect(res.body).toMatchObject({ published: false, takedown: { reason: 'spam' } })
    expect((res.body as MyProfile).avatar).not.toBeNull()
  })

  it.each([
    ['a PDF, which no avatar is', () => upload(pdf(), 'application/pdf'), 422, 'file.type-refused'],
    [
      'a file whose bytes are not what its type says',
      () => upload(png(4, 4), 'image/jpeg'),
      422,
      'file.type-refused',
    ],
    [
      'a picture over 5 MB',
      () =>
        upload(
          png(4, 4, { chunks: [pngChunk('tEXt', Buffer.alloc(5 * 1024 * 1024))] }),
          'image/png',
        ),
      413,
      'file.too-large',
    ],
  ] as const)('refuses %s, and keeps nothing', async (_, file, status, code) => {
    const { account, agent } = await someone()

    const res = await agent.put('/me/profile/avatar').send({ file: file() }).expect(status)

    expect(res.body).toMatchObject({ code })
    expect(await fileRows(account.id)).toEqual([])
    expect((await agent.get('/me/profile')).body).toEqual(empty)
  })

  it('belongs to the session account alone', async () => {
    const [a, b] = await Promise.all([someone(), someone()])
    const kept = (await a.agent.put('/me/profile/avatar').send({ file: picture() }).expect(200))
      .body as MyProfile

    await b.agent.delete('/me/profile/avatar').expect(204)

    expect((await a.agent.get('/me/profile')).body).toMatchObject({ avatar: kept.avatar })
  })
})
