import { type NestExpressApplication } from '@nestjs/platform-express'
import { type AddOn } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileKey } from '../src/modules/files/owners'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { objectKeys, upload } from './files'
import { pdf, png } from './pictures'
import {
  addEdition,
  addEditionAccess,
  addMerchandiseItem,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  setPublished,
  storedFiles,
  suspend,
  tenantWithHead,
} from './tenants'

// The picture of an add-on (docs/specs/0003-catalog.md, A4): one image an add-on, put and taken
// away with its file behind the tickets permission of the edition, and served to everyone once
// its add-on is shown in the shop of a published edition. Which permission each route needs is
// checked in route-requirements.test.ts; these cover what the routes do.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const anyone = () => request(app.getHttpServer())

/** A tenant of its own with one edition and one add-on. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  const as = (method: Method, path: string, body?: object, who: Member = t.head) => {
    const agent = request(app.getHttpServer())
    const req = agent[method](`/editions/${edition}${path}`)
      .use(session(who.token))
      .set('X-Tenant-Slug', t.slug)
    return body ? req.send(body) : req
  }
  const room = addOn(
    await as('post', '/add-ons', { name: 'Sleeping room', amountMinor: 0, kind: 'unlimited' }),
  )
  return { t, edition, as, room }
}

const addOn = (res: { body: unknown }) => res.body as AddOn
const addOns = (res: { body: unknown }) => res.body as AddOn[]
const picture = (width = 800, height = 600, name = 'room.png') =>
  upload(png(width, height), 'image/png', name)
const KIND = 'add-on-picture'

describe('the picture of an add-on', () => {
  it('is put, shown with its add-on, replaced and taken away, its file with it', async () => {
    const c = await convention()
    const at = `/add-ons/${c.room.id}/picture`
    expect(c.room.picture).toBeNull()

    const first = addOn(await c.as('put', at, { file: picture(500, 700) }).expect(200)).picture
    expect(first).toEqual({ fileId: expect.any(String) as string, width: 500, height: 700 })
    // The small size is made with the upload, the large one by its first read.
    const key = fileKey('edition', c.t.id, first!.fileId)
    expect(await objectKeys(key)).toEqual([`${key}master`, `${key}small`])
    expect(addOns(await c.as('get', '/add-ons').expect(200))[0]!.picture).toEqual(first)

    const second = addOn(await c.as('put', at, { file: picture(600, 600) }).expect(200)).picture
    expect(second!.fileId).not.toBe(first!.fileId)
    expect(await storedFiles(c.t.id, KIND)).toMatchObject([
      { id: second!.fileId, editionId: c.edition },
    ])
    expect(await objectKeys(key)).toEqual([])

    await c.as('delete', at).expect(204)
    expect(addOn(await c.as('patch', `/add-ons/${c.room.id}`, {}).expect(200)).picture).toBeNull()
    expect(await storedFiles(c.t.id, KIND)).toEqual([])
    await c.as('delete', at).expect(404)
  })

  it('goes with its add-on, its file with it', async () => {
    const c = await convention()
    const kept = addOn(
      await c.as('put', `/add-ons/${c.room.id}/picture`, { file: picture() }).expect(200),
    ).picture!

    await c.as('delete', `/add-ons/${c.room.id}`).expect(204)

    expect(await storedFiles(c.t.id, KIND)).toEqual([])
    expect(await objectKeys(fileKey('edition', c.t.id, kept.fileId))).toEqual([])
  })

  it('is an image alone, and keeps no file it refuses', async () => {
    const c = await convention()

    const res = await c.as('put', `/add-ons/${c.room.id}/picture`, {
      file: upload(pdf(), 'application/pdf', 'room.pdf'),
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(await storedFiles(c.t.id, KIND)).toEqual([])
  })

  it('is put and taken away through an add-on of the edition the path names alone', async () => {
    const c = await convention()
    const other = await convention()
    const sibling = await addEdition(c.t.id)
    await c.as('put', `/add-ons/${c.room.id}/picture`, { file: picture() }).expect(200)

    for (const id of [other.room.id, 'no-identifier']) {
      await c.as('put', `/add-ons/${id}/picture`, { file: picture() }).expect(404)
      await c.as('delete', `/add-ons/${id}/picture`).expect(404)
    }
    // The add-on of this edition is none of its sibling's.
    const elsewhere = request(app.getHttpServer())
      .put(`/editions/${sibling}/add-ons/${c.room.id}/picture`)
      .use(session(c.t.head.token))
      .set('X-Tenant-Slug', c.t.slug)
      .send({ file: picture() })
    await elsewhere.expect(404)

    expect(await storedFiles(c.t.id, KIND)).toHaveLength(1)
    expect(await storedFiles(other.t.id, KIND)).toEqual([])
  })
})

describe("the picture of an add-on as the edition's orgs read it", () => {
  /** The file of the picture of the convention's add-on, hidden or shown. */
  async function withPicture(c: Awaited<ReturnType<typeof convention>>, hidden = false) {
    const kept = addOn(
      await c.as('put', `/add-ons/${c.room.id}/picture`, { file: picture(1200, 900) }).expect(200),
    ).picture!
    if (hidden) await c.as('patch', `/add-ons/${c.room.id}`, { hidden: true }).expect(200)
    return kept.fileId
  }

  it('is served in both sizes, of a hidden add-on of an unpublished edition too', async () => {
    const c = await convention()
    const fileId = await withPicture(c, true)
    const [reader, stranger] = [await member(), await member()]
    await addEditionAccess(c.t.id, await addOrg(c.t.id, reader), c.edition, { tickets: 'read' })
    await addEditionAccess(c.t.id, await addOrg(c.t.id, stranger), c.edition, { program: 'write' })

    for (const variant of ['small', 'large']) {
      const res = await c.as('get', `/add-on-files/${fileId}/${variant}`, undefined, reader)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/webp')
      expect(res.headers['cache-control']).toMatch(/no-store/)
    }
    await c.as('get', `/add-on-files/${fileId}/small`, undefined, stranger).expect(403)
  })

  it('is no file of the edition when it is anything else', async () => {
    const c = await convention()
    const other = await convention()
    const fileId = await withPicture(c)
    const foreign = await withPicture(other)
    const shirt = await addMerchandiseItem(c.t.id, c.edition, { name: 'Shirt', stock: 5 })
    const shot = (
      (
        await c
          .as('post', `/merchandise-items/${shirt.id}/pictures`, { file: picture() })
          .expect(201)
      ).body as { pictures: { fileId: string }[] }
    ).pictures[0]!.fileId

    // Another convention's picture, a merchandise picture, an unknown size and no identifier.
    await c.as('get', `/add-on-files/${foreign}/small`).expect(404)
    await c.as('get', `/add-on-files/${shot}/small`).expect(404)
    await c.as('get', `/add-on-files/${fileId}/master`).expect(404)
    await c.as('get', '/add-on-files/no-uuid/small').expect(404)
    // And the picture of an add-on is no merchandise file.
    await c.as('get', `/merchandise-files/${fileId}/small`).expect(404)
    await c.as('get', `/add-on-files/${fileId}/small`).expect(200)
  })

  describe('and as everyone does', () => {
    const publicly = (slug: string, fileId: string, variant = 'small') =>
      anyone().get(`/public/tenants/${slug}/add-on-files/${fileId}/${variant}`)

    it('is served without a sign-in once its add-on is shown in a published edition', async () => {
      const c = await convention()
      const fileId = await withPicture(c)

      // The edition is not published yet: nothing of it is for everyone.
      await publicly(c.t.slug, fileId).expect(404)
      await setPublished(c.edition, true)

      for (const variant of ['small', 'large']) {
        const res = await publicly(c.t.slug, fileId, variant).expect(200)

        expect(res.headers['content-type']).toBe('image/webp')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
      }
    })

    it('is unknown while its add-on is hidden, and for everyone again once it is shown', async () => {
      const c = await convention()
      const fileId = await withPicture(c, true)
      await setPublished(c.edition, true)

      await publicly(c.t.slug, fileId).expect(404)

      await c.as('patch', `/add-ons/${c.room.id}`, { hidden: false }).expect(200)
      await publicly(c.t.slug, fileId).expect(200)
    })

    it('is unknown under another convention, in an unknown size and of a suspended convention', async () => {
      const c = await convention()
      const other = await convention()
      const fileId = await withPicture(c)
      await setPublished(c.edition, true)
      await setPublished(other.edition, true)

      await publicly(other.t.slug, fileId).expect(404)
      await publicly(c.t.slug, fileId, 'master').expect(404)
      await publicly(c.t.slug, 'no-uuid').expect(404)
      // No address of the merchandise serves it either.
      await anyone()
        .get(`/public/tenants/${c.t.slug}/merchandise-files/${fileId}/small`)
        .expect(404)
      await publicly(c.t.slug, fileId).expect(200)

      await suspend(c.t.id)
      await publicly(c.t.slug, fileId).expect(404)
    })
  })
})
