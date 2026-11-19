import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileKey } from '../src/modules/files/owners'
import { sniff } from '../src/modules/files/sniff'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { objectKeys, upload } from './files'
import { pdf, png } from './pictures'
import {
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  logoOf,
  member,
  type Member,
  restore,
  suspend,
  tenantWithHead,
} from './tenants'

// A convention's logo (docs/specs/0014-edition-list-and-edition-page.md): set, replaced and
// removed with the branding permission, and read by anyone. Which permission each route needs is
// checked in route-requirements.test.ts; these cover what the routes do.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'put' | 'delete'

interface Logo {
  fileId: string
  width: number
  height: number
}

let app: NestExpressApplication
let a: Tenant
let b: Tenant

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const call = (who: Member, method: Method, path: string, body?: object, slug = a.slug) => {
  const agent = request(app.getHttpServer())
  const req = agent[method](path).use(session(who.token)).set('X-Tenant-Slug', slug)
  return body ? req.send(body) : req
}

const anyone = () => request(app.getHttpServer())

const picture = (width = 400, height = 200) => upload(png(width, height), 'image/png', 'logo.png')

/** Sets the logo of a tenant as its head and answers it. */
async function setLogo(tenant: Tenant, file = picture()) {
  const res = await call(tenant.head, 'put', '/branding/logo', { file }, tenant.slug).expect(200)
  return (res.body as { logo: Logo }).logo
}

const logoPath = (tenant: Tenant, fileId: string, variant = 'small') =>
  `/public/tenants/${tenant.slug}/logo-files/${fileId}/${variant}`

describe('the logo in the panel', () => {
  it('is absent until it is set', async () => {
    const t = await tenantWithHead()

    const res = await call(t.head, 'get', '/branding', undefined, t.slug).expect(200)

    expect(res.body).toEqual({ logo: null })
  })

  it('is set from an image, kept as its master with the proportions of the picture', async () => {
    const t = await tenantWithHead()

    const logo = await setLogo(t, picture(400, 200))

    expect(logo).toEqual({ fileId: expect.any(String) as string, width: 400, height: 200 })
    expect(await logoOf(t.id)).toBe(logo.fileId)
    const read = await call(t.head, 'get', '/branding', undefined, t.slug).expect(200)
    expect(read.body).toEqual({ logo })
    // The master and the variant a row of the list shows, made with the upload.
    expect(await objectKeys(fileKey('convention', t.id, logo.fileId))).toEqual(
      ['master', 'small'].map((name) => `${fileKey('convention', t.id, logo.fileId)}${name}`),
    )
  })

  it('is replaced by a new one, whose file takes the place of the old', async () => {
    const t = await tenantWithHead()
    const first = await setLogo(t)

    const second = await setLogo(t, picture(300, 300))

    expect(second.fileId).not.toBe(first.fileId)
    expect(second).toMatchObject({ width: 300, height: 300 })
    expect(await logoOf(t.id)).toBe(second.fileId)
    expect(await objectKeys(fileKey('convention', t.id, first.fileId))).toEqual([])
  })

  it('is removed with 204, its file with it, and removing none answers the same', async () => {
    const t = await tenantWithHead()
    const logo = await setLogo(t)

    const res = await call(t.head, 'delete', '/branding/logo', undefined, t.slug).expect(204)

    expect(res.body).toEqual({})
    expect(await logoOf(t.id)).toBeUndefined()
    expect(await objectKeys(fileKey('convention', t.id, logo.fileId))).toEqual([])
    await call(t.head, 'delete', '/branding/logo', undefined, t.slug).expect(204)
  })

  it('is read with branding read access, and set only with write access', async () => {
    const t = await tenantWithHead()
    const reader = await member()
    await addOrg(t.id, reader, { branding: 'read', settings: 'write' })

    await call(reader, 'get', '/branding', undefined, t.slug).expect(200)
    const refused = await call(reader, 'put', '/branding/logo', { file: picture() }, t.slug)

    expect(refused.status).toBe(403)
    expect(await logoOf(t.id)).toBeUndefined()
  })

  it.each([
    ['a PDF', upload(pdf(), 'application/pdf', 'logo.pdf'), 422, 'file.type-refused'],
    ['a PDF sent as a PNG', upload(pdf(), 'image/png', 'logo.png'), 422, 'file.type-refused'],
    [
      'an image over 2 MB',
      upload(Buffer.concat([png(10, 10), Buffer.alloc(2 * 1024 * 1024)]), 'image/png', 'big.png'),
      413,
      'file.too-large',
    ],
  ])('refuses %s and keeps the logo it had', async (_, file, status, code) => {
    const t = await tenantWithHead()
    const logo = await setLogo(t)

    const res = await call(t.head, 'put', '/branding/logo', { file }, t.slug)

    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ code })
    expect(await logoOf(t.id)).toBe(logo.fileId)
  })

  it('refuses a body without a file, and one with a field of its own', async () => {
    const none = await call(a.head, 'put', '/branding/logo', {})
    expect(none.status).toBe(400)

    const extra = await call(a.head, 'put', '/branding/logo', { file: picture(), name: 'Mine' })
    expect(extra.status).toBe(400)
  })
})

describe('the logo for everyone', () => {
  it("shows on the convention's page with its file and proportions", async () => {
    const t = await tenantWithHead()
    expect((await anyone().get(`/public/tenants/${t.slug}`).expect(200)).body).toMatchObject({
      logo: null,
    })

    const logo = await setLogo(t, picture(400, 200))

    const page = await anyone().get(`/public/tenants/${t.slug}`).expect(200)
    expect(page.body).toMatchObject({ logo })
  })

  it.each([
    ['small', 96, 48],
    ['large', 320, 160],
  ])('is served as its %s variant, a WebP anyone may cache for good', async (variant, w, h) => {
    const t = await tenantWithHead()
    const logo = await setLogo(t, picture(400, 200))

    const res = await anyone()
      .get(logoPath(t, logo.fileId, variant))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => done(null, Buffer.concat(chunks)))
      })
      .expect(200)

    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site')
    expect(sniff(res.body as Buffer)).toMatchObject({ type: 'image/webp', width: w, height: h })
  })

  it('never enlarges a picture smaller than the box', async () => {
    const t = await tenantWithHead()
    const logo = await setLogo(t, picture(40, 20))

    const res = await anyone()
      .get(logoPath(t, logo.fileId, 'large'))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => done(null, Buffer.concat(chunks)))
      })
      .expect(200)

    expect(sniff(res.body as Buffer)).toMatchObject({ width: 40, height: 20 })
  })

  it('answers 404 for a variant the logo does not have, and never serves the master', async () => {
    const logo = await setLogo(a)

    for (const variant of ['master', 'upload', 'thumb', 'file']) {
      const res = await anyone().get(logoPath(a, logo.fileId, variant))
      expect(res.status, variant).toBe(404)
      expect(res.body, variant).toMatchObject({ code: 'request.not-found' })
    }
  })

  it('answers 404 for a replaced and for a removed logo, exactly as for an unknown file', async () => {
    const t = await tenantWithHead()
    const first = await setLogo(t)
    const second = await setLogo(t)
    const unknown = await anyone().get(logoPath(t, randomUUID())).expect(404)

    const replaced = await anyone().get(logoPath(t, first.fileId)).expect(404)
    expect(replaced.body).toEqual(unknown.body)

    await call(t.head, 'delete', '/branding/logo', undefined, t.slug).expect(204)
    const removed = await anyone().get(logoPath(t, second.fileId)).expect(404)
    expect(removed.body).toEqual(unknown.body)
  })

  it("answers 404 for another convention's logo under this one's address", async () => {
    const [mine, theirs] = await Promise.all([setLogo(a), setLogo(b)])

    await anyone().get(logoPath(a, theirs.fileId)).expect(404)
    await anyone().get(logoPath(b, mine.fileId)).expect(404)
    await anyone().get(logoPath(a, mine.fileId)).expect(200)
  })

  it.each(['not-a-uuid', 'a%00b'])('answers 404 for the file %s', async (fileId) => {
    await anyone().get(`/public/tenants/${a.slug}/logo-files/${fileId}/small`).expect(404)
  })

  it('answers 404 for the logo of a suspended convention, and serves it again once restored', async () => {
    const t = await tenantWithHead()
    const logo = await setLogo(t)

    await suspend(t.id)
    try {
      const off = await anyone().get(logoPath(t, logo.fileId))
      expect(off.status).toBe(404)
      expect(off.body).toMatchObject({ code: 'request.not-found' })
    } finally {
      await restore(t.id)
    }

    await anyone().get(logoPath(t, logo.fileId)).expect(200)
  })
})
