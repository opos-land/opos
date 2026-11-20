import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  MAX_DOCUMENT_SIZE,
  MAX_DOCUMENT_VERSIONS,
  MAX_EDITION_CONSENTS,
  MAX_EDITION_DOCUMENTS,
} from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileKey } from '../src/modules/files/owners'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { objectKeys, upload } from './files'
import { pdf, png } from './pictures'
import {
  addConsent,
  addDocument,
  addEdition,
  addEditionAccess,
  addOrg,
  addProviderAccount,
  addSeller,
  closeTenantDb,
  deleteCreatedTenants,
  makeShopReady,
  member,
  type Member,
  openShop,
  restore,
  seededDocumentVersion,
  setPublished,
  storedFiles,
  storedShop,
  suspend,
  tenantWithHead,
} from './tenants'

// What an edition sets before it sells anything (docs/specs/0002-shop-setup.md): its shop, opened
// once the convention and the edition hold what selling needs, its legal documents with their
// versions, and its consents, behind the tickets permission of the edition. Which permission each
// route needs is checked in route-requirements.test.ts; these cover what the routes do.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface Version {
  id: string
  number: number
  publishedAt: string
  file: { name: string; size: number }
}
interface Document {
  id: string
  editionId: string
  kind: string
  title: string
  hidden: boolean
  versions: Version[]
}
interface Consent {
  id: string
  editionId: string
  documentId: string | null
  text: string
  isRequired: boolean
  position: number
  hidden: boolean
}

let app: NestExpressApplication
let a: Tenant
let b: Tenant
let editionB: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  editionB = await addEdition(b.id)
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

/** A tenant of its own with one edition, so that a test changes nothing another reads. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  const at = (path = '') => `/editions/${edition}${path}`
  const as = (method: Method, path: string, body?: object, who: Member = t.head) =>
    call(who, method, at(path), body, t.slug)
  return { t, edition, at, as }
}

type Convention = Awaited<ReturnType<typeof convention>>

/** An org of the convention holding only the given access to its edition. */
async function orgWith(c: Convention, tickets: 'read' | 'write', shop?: 'read' | 'write') {
  const who = await member()
  const id = await addOrg(c.t.id, who, { shop })
  await addEditionAccess(c.t.id, id, c.edition, { tickets })
  return who
}

const terms = (name = 'terms.pdf') => upload(pdf(), 'application/pdf', name)

/** The settings of the catalog on a shop nothing was set for (docs/specs/0003-catalog.md). */
const noSettings = {
  ageBands: null,
  guardianConsentFormUrl: null,
  merchPreorderDeadline: null,
  merchOnlyEnabled: false,
  salesClosedMessage: null,
  pickupInformation: null,
}
const nothingMet = {
  'provider-account': false,
  'seller-details': false,
  'shop-terms': false,
  'privacy-policy': false,
}
const everythingMet = {
  'provider-account': true,
  'seller-details': true,
  'shop-terms': true,
  'privacy-policy': true,
}

describe('the shop of an edition', () => {
  it('is closed, with nothing set and every condition missing, until something is set', async () => {
    const c = await convention()

    const res = await c.as('get', '/shop').expect(200)

    expect(res.body).toEqual({
      open: false,
      openedAt: null,
      faqUrl: null,
      ...noSettings,
      conditions: nothingMet,
    })
  })

  it('shows each condition as met once it holds', async () => {
    const c = await convention()

    await addSeller(c.t.id)
    expect((await c.as('get', '/shop')).body).toMatchObject({
      conditions: { ...nothingMet, 'seller-details': true },
    })

    await addProviderAccount(c.t.id)
    await addDocument(c.t.id, c.edition, 'shop-terms')
    expect((await c.as('get', '/shop')).body).toMatchObject({
      conditions: { ...everythingMet, 'privacy-policy': false },
    })

    await addDocument(c.t.id, c.edition, 'privacy-policy')
    expect((await c.as('get', '/shop')).body).toMatchObject({ conditions: everythingMet })
  })

  it('counts neither a document without a version, nor a hidden one, nor one of another edition', async () => {
    const c = await convention()
    const other = await addEdition(c.t.id)
    await addDocument(c.t.id, c.edition, 'shop-terms', { versions: 0 })
    await addDocument(c.t.id, c.edition, 'privacy-policy', { hidden: true })
    await addDocument(c.t.id, other, 'shop-terms')
    await addDocument(c.t.id, other, 'privacy-policy')
    // The edition rules and a document of its own kind open nothing.
    await addDocument(c.t.id, c.edition, 'edition-rules')
    await addDocument(c.t.id, c.edition, 'other')

    const res = await c.as('get', '/shop').expect(200)

    expect(res.body).toMatchObject({ conditions: nothingMet })
  })

  it('counts no provider account that is not ready to sell', async () => {
    const c = await convention()
    await call(
      c.t.head,
      'put',
      '/shop/provider-account',
      { provider: 'fake', credentials: { account: 'not-ready' } },
      c.t.slug,
    ).expect(200)

    const res = await c.as('get', '/shop').expect(200)

    expect(res.body).toMatchObject({ conditions: nothingMet })
  })

  it('sets the address of the FAQ, and clears it', async () => {
    const c = await convention()

    const set = await c.as('patch', '/shop', { faqUrl: 'https://convention.test/faq' }).expect(200)
    expect(set.body).toMatchObject({ faqUrl: 'https://convention.test/faq', open: false })
    expect((await c.as('get', '/shop')).body).toEqual(set.body)
    expect(await storedShop(c.edition)).toMatchObject({ faqUrl: 'https://convention.test/faq' })

    const kept = await c.as('patch', '/shop', {}).expect(200)
    expect(kept.body).toEqual(set.body)

    const cleared = await c.as('patch', '/shop', { faqUrl: null }).expect(200)
    expect(cleared.body).toMatchObject({ faqUrl: null })
  })

  it.each([
    ['an address that is no link', { faqUrl: 'faq' }],
    ['a link a browser would run', { faqUrl: 'javascript:alert(1)' }],
    ['a link over 2000 characters', { faqUrl: `https://convention.test/${'a'.repeat(2000)}` }],
    ['a field of its own', { openedAt: new Date().toISOString() }],
  ])('refuses %s', async (_, body) => {
    const c = await convention()

    const res = await c.as('patch', '/shop', body)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedShop(c.edition)).toBeUndefined()
  })

  it('refuses to open with everything missing, and names each condition', async () => {
    const c = await convention()

    const res = await c.as('post', '/shop/open')

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'shop.not-ready',
      params: {
        'provider-account': 'missing',
        'seller-details': 'missing',
        'shop-terms': 'missing',
        'privacy-policy': 'missing',
      },
    })
    expect((await storedShop(c.edition))?.openedAt ?? null).toBeNull()
  })

  it.each(['provider-account', 'seller-details', 'shop-terms', 'privacy-policy'] as const)(
    'refuses to open with %s alone missing, and names it alone',
    async (missing) => {
      const c = await convention()
      if (missing !== 'provider-account') await addProviderAccount(c.t.id)
      if (missing !== 'seller-details') await addSeller(c.t.id)
      if (missing !== 'shop-terms') await addDocument(c.t.id, c.edition, 'shop-terms')
      if (missing !== 'privacy-policy') await addDocument(c.t.id, c.edition, 'privacy-policy')

      const res = await c.as('post', '/shop/open')

      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'shop.not-ready' })
      expect((res.body as { params: object }).params).toEqual({ [missing]: 'missing' })
      expect((await c.as('get', '/shop')).body).toMatchObject({ open: false })
    },
  )

  it.each([
    ['an edition not yet published', false],
    ['a published edition', true],
  ])('opens once every condition holds, on %s', async (_, isPublished) => {
    const c = await convention()
    await setPublished(c.edition, isPublished)
    await makeShopReady(c.t.id, c.edition)

    const res = await c.as('post', '/shop/open').expect(200)

    expect(res.body).toEqual({
      open: true,
      openedAt: expect.any(String) as string,
      faqUrl: null,
      ...noSettings,
      conditions: everythingMet,
    })
    expect((await c.as('get', '/shop')).body).toEqual(res.body)
    expect((await storedShop(c.edition))!.openedAt).not.toBeNull()
  })

  it('keeps the moment it was opened when it is opened again, and its FAQ address', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    await c.as('patch', '/shop', { faqUrl: 'https://convention.test/faq' }).expect(200)
    const first = await c.as('post', '/shop/open').expect(200)

    const again = await c.as('post', '/shop/open').expect(200)

    expect(again.body).toEqual(first.body)
    expect(again.body).toMatchObject({ faqUrl: 'https://convention.test/faq' })
  })

  it('closes, and closing a closed shop answers the same', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    await c.as('post', '/shop/open').expect(200)

    const res = await c.as('post', '/shop/close').expect(200)

    expect(res.body).toMatchObject({ open: false, openedAt: null, conditions: everythingMet })
    expect((await storedShop(c.edition))!.openedAt).toBeNull()
    expect((await c.as('post', '/shop/close').expect(200)).body).toEqual(res.body)
  })

  it('closes a shop nothing was set for without a word', async () => {
    const c = await convention()

    const res = await c.as('post', '/shop/close').expect(200)

    expect(res.body).toMatchObject({ open: false })
  })

  it('opens the shop of one edition and leaves another of the convention closed', async () => {
    const c = await convention()
    const other = await addEdition(c.t.id)
    await makeShopReady(c.t.id, c.edition)

    await c.as('post', '/shop/open').expect(200)

    const res = await call(c.t.head, 'get', `/editions/${other}/shop`, undefined, c.t.slug)
    expect(res.body).toMatchObject({
      open: false,
      conditions: { ...everythingMet, 'shop-terms': false, 'privacy-policy': false },
    })
  })

  it('is opened by an org with tickets write access alone, who learns a yes or a no and nothing more', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    const org = await orgWith(c, 'write')

    const read = await c.as('get', '/shop', undefined, org).expect(200)
    const opened = await c.as('post', '/shop/open', undefined, org).expect(200)

    expect(Object.keys(read.body as object).sort()).toEqual([
      'ageBands',
      'conditions',
      'faqUrl',
      'guardianConsentFormUrl',
      'merchOnlyEnabled',
      'merchPreorderDeadline',
      'open',
      'openedAt',
      'pickupInformation',
      'salesClosedMessage',
    ])
    expect(read.body).toMatchObject({ conditions: everythingMet })
    expect(JSON.stringify([read.body, opened.body])).not.toMatch(/Seller Ltd|sealed|fake/)
    // The convention's own settings stay behind the shop permission.
    await call(org, 'get', '/shop/seller', undefined, c.t.slug).expect(403)
    await call(org, 'get', '/shop/provider-account', undefined, c.t.slug).expect(403)
  })

  it('is read with tickets read access, and changed only with write access', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    const reader = await orgWith(c, 'read', 'write')

    await c.as('get', '/shop', undefined, reader).expect(200)
    for (const [method, path, body] of [
      ['post', '/shop/open', undefined],
      ['post', '/shop/close', undefined],
      ['patch', '/shop', { faqUrl: 'https://convention.test/faq' }],
    ] as const) {
      const res = await c.as(method, path, body, reader)
      expect(res.status, path).toBe(403)
    }

    expect(await storedShop(c.edition)).toBeUndefined()
  })

  it('is not opened by an org with the shop permission and no access to the edition', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    const org = await member()
    await addOrg(c.t.id, org, { shop: 'write', settings: 'write' })

    expect((await c.as('get', '/shop', undefined, org)).status).toBe(403)
    expect((await c.as('post', '/shop/open', undefined, org)).status).toBe(403)
    expect(await storedShop(c.edition)).toBeUndefined()
  })

  it("answers 404 for another convention's edition, and opens nothing there", async () => {
    await makeShopReady(b.id, editionB)

    const read = await call(a.head, 'get', `/editions/${editionB}/shop`)
    const opened = await call(a.head, 'post', `/editions/${editionB}/shop/open`)

    expect(read.status).toBe(404)
    expect(opened.status).toBe(404)
    expect(await storedShop(editionB)).toBeUndefined()
  })
})

describe('the documents of an edition', () => {
  const add = async (c: Convention, kind = 'shop-terms', title = 'Shop terms') =>
    (await c.as('post', '/documents', { kind, title }).expect(201)).body as Document
  const publish = async (c: Convention, documentId: string, file = terms()) =>
    (await c.as('post', `/documents/${documentId}/versions`, { file }).expect(201)).body as Document
  const list = async (c: Convention) =>
    (await c.as('get', '/documents').expect(200)).body as Document[]

  it('are none until one is added', async () => {
    const c = await convention()

    expect(await list(c)).toEqual([])
  })

  it('are added with a kind and a title, shown and without a version', async () => {
    const c = await convention()

    const document = await add(c, 'privacy-policy', '  Privacy policy  ')

    expect(document).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      kind: 'privacy-policy',
      title: 'Privacy policy',
      hidden: false,
      versions: [],
    })
    expect(await list(c)).toEqual([document])
  })

  it('are listed by kind, those opening asks for first, and within a kind as they were added', async () => {
    const c = await convention()
    for (const [kind, title] of [
      ['other', 'Map of the venue'],
      ['edition-rules', 'Rules'],
      ['privacy-policy', 'Privacy'],
      ['shop-terms', 'Terms'],
      ['other', 'Accessibility'],
    ]) {
      await add(c, kind, title)
    }

    expect((await list(c)).map((document) => document.title)).toEqual([
      'Terms',
      'Privacy',
      'Rules',
      'Map of the venue',
      'Accessibility',
    ])
  })

  it.each([
    ['a kind OPOS does not know', { kind: 'cookies', title: 'Cookies' }],
    ['no title', { kind: 'other' }],
    ['an empty title', { kind: 'other', title: '  ' }],
    ['a title over 200 characters', { kind: 'other', title: 'a'.repeat(201) }],
    ['a field of its own', { kind: 'other', title: 'Rules', hidden: true }],
  ])('refuse %s', async (_, body) => {
    const c = await convention()

    const res = await c.as('post', '/documents', body)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await list(c)).toEqual([])
  })

  it('publish a PDF as their first version, kept as a file of the edition', async () => {
    const c = await convention()
    const document = await add(c)

    const published = await publish(c, document.id, terms('Shop terms 2027.pdf'))

    expect(published).toEqual({
      ...document,
      versions: [
        {
          id: expect.any(String) as string,
          number: 1,
          publishedAt: expect.any(String) as string,
          file: { name: 'Shop terms 2027.pdf', size: pdf().length },
        },
      ],
    })
    expect(await list(c)).toEqual([published])
    const [file] = await storedFiles(c.t.id, 'edition-document')
    expect(file).toMatchObject({ editionId: c.edition })
    expect(await objectKeys(fileKey('edition', c.t.id, file!.id))).toEqual([
      `${fileKey('edition', c.t.id, file!.id)}file`,
    ])
  })

  it('number their versions from 1 and list the newest first, each keeping its file', async () => {
    const c = await convention()
    const document = await add(c)
    const first = await publish(c, document.id, terms('first.pdf'))

    const second = await publish(c, document.id, terms('second.pdf'))

    expect(second.versions.map((version) => [version.number, version.file.name])).toEqual([
      [2, 'second.pdf'],
      [1, 'first.pdf'],
    ])
    expect(second.versions[1]).toEqual(first.versions[0])
    expect(await storedFiles(c.t.id, 'edition-document')).toHaveLength(2)
  })

  it.each([
    ['an image', upload(png(10, 10), 'image/png', 'terms.png'), 422, 'file.type-refused'],
    [
      'an image sent as a PDF',
      upload(png(10, 10), 'application/pdf', 'terms.pdf'),
      422,
      'file.type-refused',
    ],
    [
      'a PDF over the limit',
      upload(Buffer.concat([pdf(), Buffer.alloc(MAX_DOCUMENT_SIZE)]), 'application/pdf', 'big.pdf'),
      413,
      'file.too-large',
    ],
  ])('refuse %s as a version, and keep nothing of it', async (_, file, status, code) => {
    const c = await convention()
    const document = await add(c)

    const res = await c.as('post', `/documents/${document.id}/versions`, { file })

    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ code })
    expect(await list(c)).toEqual([document])
    expect(await storedFiles(c.t.id, 'edition-document')).toEqual([])
  })

  it('refuse a version without a file, and one for a document the edition does not hold', async () => {
    const c = await convention()
    const document = await add(c)
    const elsewhere = await addDocument(b.id, editionB)

    const other = await addEdition(c.t.id)
    const sibling = await addDocument(c.t.id, other, 'other', { versions: 0 })

    expect((await c.as('post', `/documents/${document.id}/versions`, {})).status).toBe(400)
    // A document of another edition of the same convention is none of this path either.
    for (const id of [randomUUID(), elsewhere.id, sibling.id, 'not-a-uuid']) {
      const res = await c.as('post', `/documents/${id}/versions`, { file: terms() })
      expect(res.status, id).toBe(404)
    }
    expect(await storedFiles(c.t.id, 'edition-document')).toEqual([])
  })

  it('have no route that changes or removes a published version', async () => {
    const c = await convention()
    const document = await publish(c, (await add(c)).id)
    const version = `/documents/${document.id}/versions/${document.versions[0]!.id}`

    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await c.as(method, version, method === 'delete' ? undefined : { number: 5 })
      expect(res.status, method).toBe(404)
    }

    expect(await list(c)).toEqual([document])
  })

  it('change their title, and are hidden and shown again', async () => {
    const c = await convention()
    const document = await publish(c, (await add(c, 'edition-rules', 'Rules')).id)

    const renamed = await c.as('patch', `/documents/${document.id}`, { title: 'House rules' })
    expect(renamed.body).toEqual({ ...document, title: 'House rules' })

    const hidden = await c.as('patch', `/documents/${document.id}`, { hidden: true }).expect(200)
    expect(hidden.body).toEqual({ ...document, title: 'House rules', hidden: true })
    expect(await list(c)).toEqual([hidden.body])

    const shown = await c.as('patch', `/documents/${document.id}`, { hidden: false }).expect(200)
    expect(shown.body).toMatchObject({ hidden: false })
  })

  it.each([
    ['their kind', { kind: 'other' }],
    ['an empty title', { title: ' ' }],
    ['a field of its own', { versions: [] }],
  ])('refuse a change of %s', async (_, body) => {
    const c = await convention()
    const document = await add(c)

    const res = await c.as('patch', `/documents/${document.id}`, body)

    expect(res.status).toBe(400)
    expect(await list(c)).toEqual([document])
  })

  it('cannot be hidden while the shop is open and opening asks for them, and can once it is closed', async () => {
    const c = await convention()
    const ready = await makeShopReady(c.t.id, c.edition)
    await openShop(c.t.id, c.edition)

    for (const id of [ready.terms.id, ready.privacy.id]) {
      const refused = await c.as('patch', `/documents/${id}`, { hidden: true })
      expect(refused.status).toBe(409)
      expect(refused.body).toMatchObject({ code: 'shop.open' })
    }
    // A change that hides nothing goes through.
    await c.as('patch', `/documents/${ready.terms.id}`, { title: 'Terms' }).expect(200)
    expect((await list(c)).every((document) => !document.hidden)).toBe(true)

    await c.as('post', '/shop/close').expect(200)
    await c.as('patch', `/documents/${ready.terms.id}`, { hidden: true }).expect(200)
  })

  it('can be hidden while the shop is open when opening does not ask for them', async () => {
    const c = await convention()
    const ready = await makeShopReady(c.t.id, c.edition)
    const rules = await addDocument(c.t.id, c.edition, 'edition-rules')
    const newerTerms = await addDocument(c.t.id, c.edition, 'shop-terms')
    await openShop(c.t.id, c.edition)

    await c.as('patch', `/documents/${rules.id}`, { hidden: true }).expect(200)
    // Another document of the kind, with a version, still stands for it.
    await c.as('patch', `/documents/${ready.terms.id}`, { hidden: true }).expect(200)
    const last = await c.as('patch', `/documents/${newerTerms.id}`, { hidden: true })

    expect(last.status).toBe(409)
    expect(last.body).toMatchObject({ code: 'shop.open' })
  })

  it('are deleted with their versions and files, and a deleted one is not found', async () => {
    const c = await convention()
    const document = await publish(c, (await add(c)).id)
    await publish(c, document.id)
    const files = await storedFiles(c.t.id, 'edition-document')
    expect(files).toHaveLength(2)

    const res = await c.as('delete', `/documents/${document.id}`).expect(204)

    expect(res.body).toEqual({})
    expect(await list(c)).toEqual([])
    expect(await storedFiles(c.t.id, 'edition-document')).toEqual([])
    for (const file of files) {
      expect(await objectKeys(fileKey('edition', c.t.id, file.id))).toEqual([])
    }
    expect((await c.as('delete', `/documents/${document.id}`)).status).toBe(404)
  })

  it('cannot be deleted while a consent links them, and can once the consent is gone', async () => {
    const c = await convention()
    const document = await addDocument(c.t.id, c.edition)
    const consent = await addConsent(c.t.id, c.edition, { documentId: document.id })

    const refused = await c.as('delete', `/documents/${document.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'document.in-use' })
    expect(await list(c)).toHaveLength(1)

    // A consent links its document for good: it lets go by being deleted.
    await c.as('delete', `/consents/${consent}`).expect(204)
    await c.as('delete', `/documents/${document.id}`).expect(204)
  })

  it('cannot be deleted while the shop is open and opening asks for them', async () => {
    const c = await convention()
    const ready = await makeShopReady(c.t.id, c.edition)
    const rules = await addDocument(c.t.id, c.edition, 'edition-rules')
    await openShop(c.t.id, c.edition)

    const refused = await c.as('delete', `/documents/${ready.privacy.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'shop.open' })
    await c.as('delete', `/documents/${rules.id}`).expect(204)

    await c.as('post', '/shop/close').expect(200)
    await c.as('delete', `/documents/${ready.privacy.id}`).expect(204)
  })

  it('hold no more than an edition may, nor a document more versions than it may', async () => {
    const c = await convention()
    const full = await addDocument(c.t.id, c.edition, 'other', { versions: MAX_DOCUMENT_VERSIONS })
    for (let count = 1; count < MAX_EDITION_DOCUMENTS; count += 1) {
      await addDocument(c.t.id, c.edition, 'other', { versions: 0 })
    }

    const document = await c.as('post', '/documents', { kind: 'other', title: 'One more' })
    const version = await c.as('post', `/documents/${full.id}/versions`, { file: terms() })

    expect(document.status).toBe(409)
    expect(document.body).toMatchObject({
      code: 'document.too-many',
      params: { limit: MAX_EDITION_DOCUMENTS },
    })
    expect(version.status).toBe(409)
    expect(version.body).toMatchObject({
      code: 'document.too-many-versions',
      params: { limit: MAX_DOCUMENT_VERSIONS },
    })
    expect(await list(c)).toHaveLength(MAX_EDITION_DOCUMENTS)
  })

  it('are read with tickets read access, and changed only with write access', async () => {
    const c = await convention()
    const document = await addDocument(c.t.id, c.edition)
    const reader = await orgWith(c, 'read', 'write')

    expect((await c.as('get', '/documents', undefined, reader).expect(200)).body).toHaveLength(1)
    for (const [method, path, body] of [
      ['post', '/documents', { kind: 'other', title: 'Mine' }],
      ['patch', `/documents/${document.id}`, { title: 'Mine' }],
      ['post', `/documents/${document.id}/versions`, { file: terms() }],
      ['delete', `/documents/${document.id}`, undefined],
    ] as const) {
      expect((await c.as(method, path, body, reader)).status, `${method} ${path}`).toBe(403)
    }

    expect(await list(c)).toMatchObject([{ id: document.id, title: 'other' }])
    expect(await storedFiles(c.t.id, 'edition-document')).toHaveLength(1)
  })

  it("are an edition's own: another edition and another convention hold none of them", async () => {
    const c = await convention()
    const other = await addEdition(c.t.id)
    const document = await addDocument(c.t.id, c.edition)
    const foreign = await addDocument(b.id, editionB)

    const inOther = `/editions/${other}/documents`
    expect((await call(c.t.head, 'get', inOther, undefined, c.t.slug)).body).toEqual([])
    for (const id of [document.id, foreign.id]) {
      const path = `${inOther}/${id}`
      expect((await call(c.t.head, 'patch', path, { title: 'Mine' }, c.t.slug)).status).toBe(404)
      expect((await call(c.t.head, 'delete', path, undefined, c.t.slug)).status).toBe(404)
    }
    expect((await c.as('patch', `/documents/${foreign.id}`, { title: 'Mine' })).status).toBe(404)
    expect((await call(a.head, 'get', c.at('/documents'))).status).toBe(404)
  })
})

describe('the consents of an edition', () => {
  const list = async (c: Convention) =>
    (await c.as('get', '/consents').expect(200)).body as Consent[]
  const add = async (c: Convention, body: object) =>
    (await c.as('post', '/consents', body).expect(201)).body as Consent

  it('are none until one is added', async () => {
    const c = await convention()

    expect(await list(c)).toEqual([])
  })

  it('are added at the end of the list, with the sentence a buyer accepts', async () => {
    const c = await convention()
    const document = await addDocument(c.t.id, c.edition, 'shop-terms')

    const first = await add(c, {
      text: '  I accept the shop terms.  ',
      isRequired: true,
      documentId: document.id,
    })
    const second = await add(c, { text: 'Send me news of the convention.', isRequired: false })

    expect(first).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      documentId: document.id,
      text: 'I accept the shop terms.',
      isRequired: true,
      position: 1,
      hidden: false,
    })
    expect(second).toMatchObject({ documentId: null, isRequired: false, position: 2 })
    expect(await list(c)).toEqual([first, second])
  })

  it.each([
    ['no sentence', { isRequired: true }],
    ['an empty sentence', { text: ' ', isRequired: true }],
    ['a sentence over 1000 characters', { text: 'a'.repeat(1001), isRequired: true }],
    ['no word on whether it is required', { text: 'I accept' }],
    ['a document that is no identifier', { text: 'I accept', isRequired: true, documentId: 'x' }],
    ['a place of its own choosing', { text: 'I accept', isRequired: true, position: 1 }],
  ])('refuse %s', async (_, body) => {
    const c = await convention()

    const res = await c.as('post', '/consents', body)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await list(c)).toEqual([])
  })

  it('link only a document of their own edition', async () => {
    const c = await convention()
    const other = await addEdition(c.t.id)
    const elsewhere = await addDocument(c.t.id, other)
    const foreign = await addDocument(b.id, editionB)

    for (const documentId of [elsewhere.id, foreign.id, randomUUID()]) {
      const created = await c.as('post', '/consents', {
        text: 'I accept',
        isRequired: true,
        documentId,
      })
      expect(created.status, documentId).toBe(404)
    }

    expect(await list(c)).toEqual([])
  })

  it('change their sentence, whether they are required and whether they are hidden', async () => {
    const c = await convention()
    const consent = await add(c, { text: 'I accept', isRequired: true })

    const changed = await c
      .as('patch', `/consents/${consent.id}`, {
        text: 'I accept the rules.',
        isRequired: false,
        hidden: true,
      })
      .expect(200)

    expect(changed.body).toEqual({
      ...consent,
      text: 'I accept the rules.',
      isRequired: false,
      hidden: true,
    })
    expect(await list(c)).toEqual([changed.body])
    const shown = await c.as('patch', `/consents/${consent.id}`, { hidden: false })
    expect(shown.body).toMatchObject({ hidden: false, text: 'I accept the rules.' })
  })

  it('link their document for good: a change aims them at no other, and at none', async () => {
    const c = await convention()
    const [terms, privacy] = [
      await addDocument(c.t.id, c.edition, 'shop-terms'),
      await addDocument(c.t.id, c.edition, 'privacy-policy'),
    ]
    const consent = await add(c, { text: 'I accept', isRequired: true, documentId: terms.id })

    for (const documentId of [privacy.id, null]) {
      const res = await c.as('patch', `/consents/${consent.id}`, { documentId })
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }

    expect(await list(c)).toEqual([consent])
  })

  it('move to the place given, the others making room in their order', async () => {
    const c = await convention()
    const [one, two, three] = [
      await add(c, { text: 'One', isRequired: true }),
      await add(c, { text: 'Two', isRequired: true }),
      await add(c, { text: 'Three', isRequired: true }),
    ]
    const order = async () => (await list(c)).map((consent) => [consent.text, consent.position])

    const moved = await c.as('patch', `/consents/${three.id}`, { position: 1 }).expect(200)
    expect(moved.body).toMatchObject({ id: three.id, position: 1 })
    expect(await order()).toEqual([
      ['Three', 1],
      ['One', 2],
      ['Two', 3],
    ])

    // A place past the end is the last one.
    await c.as('patch', `/consents/${three.id}`, { position: 9 }).expect(200)
    expect(await order()).toEqual([
      ['One', 1],
      ['Two', 2],
      ['Three', 3],
    ])

    await c.as('patch', `/consents/${one.id}`, { position: 2, text: 'First' }).expect(200)
    expect(await order()).toEqual([
      ['Two', 1],
      ['First', 2],
      ['Three', 3],
    ])
    expect(two.position).toBe(2)
  })

  it.each([
    ['an empty sentence', { text: '' }],
    ['a place before the first', { position: 0 }],
    ['a field of its own', { editionId: randomUUID() }],
  ])('refuse a change to %s', async (_, body) => {
    const c = await convention()
    const consent = await add(c, { text: 'I accept', isRequired: true })

    const res = await c.as('patch', `/consents/${consent.id}`, body)

    expect(res.status).toBe(400)
    expect(await list(c)).toEqual([consent])
  })

  it('are deleted with 204, the rest closing ranks, and a deleted one is not found', async () => {
    const c = await convention()
    const one = await add(c, { text: 'One', isRequired: true })
    const two = await add(c, { text: 'Two', isRequired: true })
    const three = await add(c, { text: 'Three', isRequired: true })

    const res = await c.as('delete', `/consents/${two.id}`).expect(204)

    expect(res.body).toEqual({})
    expect(await list(c)).toEqual([one, { ...three, position: 2 }])
    expect((await c.as('delete', `/consents/${two.id}`)).status).toBe(404)
    expect((await c.as('patch', `/consents/${two.id}`, { text: 'Gone' })).status).toBe(404)
  })

  it('hold no more than an edition may', async () => {
    const c = await convention()
    for (let count = 0; count < MAX_EDITION_CONSENTS; count += 1) {
      await addConsent(c.t.id, c.edition)
    }

    const res = await c.as('post', '/consents', { text: 'One more', isRequired: false })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'consent.too-many',
      params: { limit: MAX_EDITION_CONSENTS },
    })
    expect(await list(c)).toHaveLength(MAX_EDITION_CONSENTS)
  })

  it('are read with tickets read access, and changed only with write access', async () => {
    const c = await convention()
    const consent = await addConsent(c.t.id, c.edition)
    const reader = await orgWith(c, 'read', 'write')

    expect((await c.as('get', '/consents', undefined, reader).expect(200)).body).toHaveLength(1)
    for (const [method, path, body] of [
      ['post', '/consents', { text: 'Mine', isRequired: true }],
      ['patch', `/consents/${consent}`, { text: 'Mine' }],
      ['delete', `/consents/${consent}`, undefined],
    ] as const) {
      expect((await c.as(method, path, body, reader)).status, `${method} ${path}`).toBe(403)
    }

    expect(await list(c)).toMatchObject([{ id: consent, text: 'I accept the terms' }])
  })

  it("are an edition's own: another edition and another convention hold none of them", async () => {
    const c = await convention()
    const other = await addEdition(c.t.id)
    const consent = await addConsent(c.t.id, c.edition)
    const foreign = await addConsent(b.id, editionB)

    const inOther = `/editions/${other}/consents`
    expect((await call(c.t.head, 'get', inOther, undefined, c.t.slug)).body).toEqual([])
    for (const id of [consent, foreign, 'not-a-uuid']) {
      const path = `${inOther}/${id}`
      expect((await call(c.t.head, 'patch', path, { text: 'Mine' }, c.t.slug)).status).toBe(404)
      expect((await call(c.t.head, 'delete', path, undefined, c.t.slug)).status).toBe(404)
    }
    expect((await c.as('delete', `/consents/${foreign}`)).status).toBe(404)
    expect(await list(c)).toMatchObject([{ id: consent }])
  })
})

describe('a published version for everyone', () => {
  const path = (tenant: { slug: string }, versionId: string) =>
    `/public/tenants/${tenant.slug}/document-versions/${versionId}`
  const download = (address: string) =>
    anyone()
      .get(address)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => done(null, Buffer.concat(chunks)))
      })

  /** A document of the convention with one version, published through the API. */
  async function published(c: Convention, name = 'terms.pdf') {
    const created = await c.as('post', '/documents', { kind: 'shop-terms', title: 'Terms' })
    const { id } = created.body as Document
    const res = await c.as('post', `/documents/${id}/versions`, { file: terms(name) }).expect(201)
    return res.body as Document
  }

  it('is served to anyone as a download under its name, for good', async () => {
    const c = await convention()
    const document = await published(c, 'Regulamin sklepu.pdf')

    const res = await download(path(c.t, document.versions[0]!.id)).expect(200)

    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="Regulamin sklepu.pdf"/,
    )
    // Kept by no cache: a deleted document and a suspended convention stop answering at once.
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.compare(res.body as Buffer, pdf())).toBe(0)
  })

  it('is served for an edition that was never published', async () => {
    const c = await convention()
    const document = await published(c)

    // A buyer reads what they accepted whatever became of the edition; the address is the
    // version's own identifier, which the panel alone shows until the shop links it.
    await download(path(c.t, document.versions[0]!.id)).expect(200)
    await setPublished(c.edition, true)
    await setPublished(c.edition, false)
    await download(path(c.t, document.versions[0]!.id)).expect(200)
  })

  it('stays readable once its document is hidden, and once a newer version is published', async () => {
    const c = await convention()
    const document = await published(c)
    const first = document.versions[0]!.id
    await c.as('post', `/documents/${document.id}/versions`, { file: terms() }).expect(201)
    await c.as('patch', `/documents/${document.id}`, { hidden: true }).expect(200)

    await download(path(c.t, first)).expect(200)
  })

  it('is not found once its document is deleted, exactly as an unknown one', async () => {
    const c = await convention()
    const document = await published(c)
    const unknown = await anyone().get(path(c.t, randomUUID())).expect(404)
    await c.as('delete', `/documents/${document.id}`).expect(204)

    const gone = await anyone().get(path(c.t, document.versions[0]!.id)).expect(404)

    expect(gone.body).toEqual(unknown.body)
    expect(gone.body).toMatchObject({ code: 'request.not-found' })
  })

  it("is not found under another convention's address", async () => {
    const c = await convention()
    const document = await published(c)

    await anyone().get(path(b, document.versions[0]!.id)).expect(404)
    await anyone().get(path(a, document.versions[0]!.id)).expect(404)
    await download(path(c.t, document.versions[0]!.id)).expect(200)
  })

  it.each(['not-a-uuid', 'a%00b'])('is not found as %s', async (versionId) => {
    await anyone().get(`/public/tenants/${a.slug}/document-versions/${versionId}`).expect(404)
  })

  it('is not found while its convention is suspended, and is served again once restored', async () => {
    const c = await convention()
    const document = await published(c)
    const address = path(c.t, document.versions[0]!.id)

    await suspend(c.t.id)
    try {
      const off = await anyone().get(address)
      expect(off.status).toBe(404)
      expect(off.body).toMatchObject({ code: 'request.not-found' })
    } finally {
      await restore(c.t.id)
    }

    await download(address).expect(200)
  })

  // The seed writes the rows of its demo documents and puts their files into the bucket itself,
  // under the keys the storage reads: this fails when the two stop agreeing.
  it('is served for a document the seed published, from the file the seed put into the bucket', async () => {
    const versionId = await seededDocumentVersion('convention-a')
    expect(versionId, 'run pnpm db:seed').toBeDefined()

    const res = await download(path({ slug: 'convention-a' }, versionId!)).expect(200)

    expect(res.headers['content-type']).toBe('application/pdf')
    expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it("is addressed by the version alone: its file's own identifier names nothing", async () => {
    const c = await convention()
    await published(c)
    const [file] = await storedFiles(c.t.id, 'edition-document')

    await anyone().get(path(c.t, file!.id)).expect(404)
  })
})
