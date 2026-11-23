import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type MyProfile } from '@opos/contract'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sniff } from '../src/modules/files/sniff'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, signedInAgent } from './auth'
import { asPostgres, upload } from './files'
import { png } from './pictures'

// What anyone reads of an account (docs/specs/0016-public-profile.md,
// docs/adr/0071-let-anyone-read-the-profile-an-account-published.md): a published profile by its
// public identifier, and an avatar by the identifier of its file.

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

/** A visitor: no session and no origin of an application. */
const anyone = () => request(app.getHttpServer())

const held = {
  description: 'Game master.\nSince 2010.',
  pronouns: 'she/her',
  city: 'Gdynia',
  links: ['https://example.test/me'],
  interests: ['larp', 'tabletop-rpg'],
}

async function someone(
  metadata: Record<string, string> = { first_name: 'Anna', last_name: 'Nowak' },
) {
  const account = await createAccount(metadata)
  return { account, agent: await signedInAgent('portal', account.email) }
}

/** An account with a published profile, and the identifier of its page. */
async function published(metadata?: Record<string, string>) {
  const who = await someone(metadata)
  const profile = (await who.agent.post('/me/profile/publication').expect(200)).body as MyProfile
  return { ...who, profileId: profile.profileId! }
}

const takeDown = (accountId: string) =>
  asPostgres(sql`
    update account_profiles
    set published_at = null, taken_down_at = now(), taken_down_reason = 'spam',
      taken_down_after_report = false
    where account_id = ${accountId}
  `)

const image = (path: string) =>
  anyone()
    .get(path)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => done(null, Buffer.concat(chunks)))
    })

describe('GET /public/profiles/{profileId}', () => {
  it('answers a published profile to anyone: the public name, the avatar and what it holds', async () => {
    const { agent, profileId } = await published()
    await agent.patch('/me').send({ nickname: 'Lisek', nameOrder: 'nickname-last' }).expect(200)
    await agent.put('/me/profile').send(held).expect(200)
    const mine = (
      await agent
        .put('/me/profile/avatar')
        .send({ file: upload(png(40, 20), 'image/png') })
        .expect(200)
    ).body as MyProfile

    const res = await anyone().get(`/public/profiles/${profileId}`).expect(200)

    expect(res.body).toEqual({
      profileId,
      firstName: 'Anna',
      nickname: 'Lisek',
      lastName: 'Nowak',
      nameOrder: 'nickname-last',
      avatar: mine.avatar,
      ...held,
    })
  })

  it('answers a profile that holds nothing, of an account with no part of a name', async () => {
    const { profileId } = await published({})

    const res = await anyone().get(`/public/profiles/${profileId}`).expect(200)

    expect(res.body).toEqual({
      profileId,
      firstName: null,
      nickname: null,
      lastName: null,
      nameOrder: 'nickname-middle',
      avatar: null,
      description: null,
      pronouns: null,
      city: null,
      links: [],
      interests: [],
    })
  })

  it('holds nothing else of the account: no identifier and no email address of it', async () => {
    const { account, profileId } = await published()

    const body = JSON.stringify((await anyone().get(`/public/profiles/${profileId}`)).body)

    expect(body).not.toContain(account.id)
    expect(body).not.toContain(account.email)
  })

  it('answers the same to a visitor and to a signed-in account', async () => {
    const { profileId } = await published()
    const { agent } = await someone()

    const [visitor, signedIn] = await Promise.all([
      anyone().get(`/public/profiles/${profileId}`).expect(200),
      agent.get(`/public/profiles/${profileId}`).expect(200),
    ])

    expect(signedIn.body).toEqual(visitor.body)
  })

  // P9: nobody can tell a profile that is hidden from one that never was.
  it('answers alike for a profile withdrawn, taken down, never published and never made, and for an identifier that is none', async () => {
    const [withdrawn, down, never, bare] = await Promise.all([
      published(),
      published(),
      someone(),
      someone(),
    ])
    await withdrawn.agent.delete('/me/profile/publication').expect(200)
    await takeDown(down.account.id)
    await never.agent.put('/me/profile').send(held).expect(200)
    const hidden = (
      await asPostgres(
        sql`select public_id from account_profiles where account_id = ${never.account.id}`,
      )
    )[0] as { public_id: string }

    const answers = await Promise.all(
      [
        withdrawn.profileId,
        down.profileId,
        hidden.public_id,
        // The account's own identifier never opens its profile.
        bare.account.id,
        withdrawn.account.id,
        randomUUID(),
        'not-an-identifier',
      ].map((id) => anyone().get(`/public/profiles/${id}`)),
    )

    for (const answer of answers) {
      expect(answer.status).toBe(404)
      expect(answer.body).toEqual(answers[0]!.body)
    }
    expect(answers[0]!.body).toMatchObject({ code: 'request.not-found' })
  })

  it('answers a profile again once it is published again, under the same identifier', async () => {
    const { agent, profileId } = await published()
    await agent.delete('/me/profile/publication').expect(200)
    await anyone().get(`/public/profiles/${profileId}`).expect(404)

    await agent.post('/me/profile/publication').expect(200)

    await anyone().get(`/public/profiles/${profileId}`).expect(200)
  })
})

describe('GET /public/avatar-files/{fileId}/{variant}', () => {
  const avatarOf = async (agent: Awaited<ReturnType<typeof signedInAgent>>, name = 'me.png') =>
    (
      (
        await agent
          .put('/me/profile/avatar')
          .send({ file: upload(png(400, 200), 'image/png', name) })
          .expect(200)
      ).body as MyProfile
    ).avatar!.fileId

  // A2: public from its upload, whether or not the profile is published.
  it.each([
    ['large', 320],
    ['small', 96],
  ])(
    'serves the %s variant of an avatar to anyone, a square anyone may cache for good, with the profile never published',
    async (variant, side) => {
      const { agent } = await someone()
      const fileId = await avatarOf(agent)

      const res = await image(`/public/avatar-files/${fileId}/${variant}`).expect(200)

      expect(res.headers['content-type']).toBe('image/webp')
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site')
      // Cut from the middle of a picture twice as wide as high, and never enlarged.
      const size = Math.min(side, 200)
      expect(sniff(res.body as Buffer)).toMatchObject({
        type: 'image/webp',
        width: size,
        height: size,
      })
    },
  )

  it('names the file by its fixed label, never by the name it was uploaded under', async () => {
    const { agent } = await someone()
    const fileId = await avatarOf(agent, 'Anna Nowak passport.png')

    const res = await image(`/public/avatar-files/${fileId}/small`).expect(200)

    expect(res.headers['content-disposition']).toContain('avatar.webp')
    expect(res.headers['content-disposition']).not.toMatch(/Anna|Nowak|passport/)
  })

  it('answers a replaced and a removed avatar as not found at its old address', async () => {
    const { agent } = await someone()
    const first = await avatarOf(agent)
    const second = await avatarOf(agent)
    await anyone().get(`/public/avatar-files/${first}/small`).expect(404)
    await image(`/public/avatar-files/${second}/small`).expect(200)

    await agent.delete('/me/profile/avatar').expect(204)

    await anyone().get(`/public/avatar-files/${second}/small`).expect(404)
  })

  it('answers the master, an undeclared variant, an unknown file and an identifier that is none as not found', async () => {
    const { agent } = await someone()
    const fileId = await avatarOf(agent)

    for (const path of [
      `/public/avatar-files/${fileId}/master`,
      `/public/avatar-files/${fileId}/huge`,
      `/public/avatar-files/${randomUUID()}/small`,
      '/public/avatar-files/not-an-identifier/small',
    ]) {
      expect((await anyone().get(path)).body).toMatchObject({ code: 'request.not-found' })
    }
  })

  it('finds no avatar by the identifier of its account', async () => {
    const { account, agent } = await someone()
    await avatarOf(agent)

    await anyone().get(`/public/avatar-files/${account.id}/small`).expect(404)
  })
})
