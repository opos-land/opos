import { type NestExpressApplication } from '@nestjs/platform-express'
import { SHOP_CURRENCY } from '@opos/contract'
import { open, providerAccountOf, sealingKey } from '@opos/db/sealed'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { loadEnv } from '../src/config/env'
import { FAKE_ACCOUNT, FakeProvider } from '../src/modules/payments/fake-provider'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addEdition,
  addOrg,
  addProviderAccount,
  closeShop,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  moveProviderAccount,
  openShop,
  storedProviderAccount,
  tenantWithHead,
} from './tenants'

// What a convention sets before an edition sells anything (docs/specs/0002-shop-setup.md): the
// seller's details and its own payment provider account, behind the shop permission. Which
// permission each route needs is checked in route-requirements.test.ts; these cover what the
// routes do, against the fake provider.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'put' | 'delete'

const env = loadEnv()
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

const seller = {
  sellerName: 'Convention A Foundation',
  sellerAddress: 'ul. Przykładowa 1, 00-001 Warszawa',
  sellerRegistrationNumber: 'KRS 0000000000',
  contactEmail: 'shop@convention-a.test',
}

/** The credentials of a tenant's fake account, opened as the API opens them. */
const opened = (tenantId: string, sealed: string) =>
  open(sealingKey(env.PAYMENT_CREDENTIALS_KEY), sealed, providerAccountOf(tenantId, 'fake'))

const connect = (tenant: Tenant, account = 'demo') =>
  call(
    tenant.head,
    'put',
    '/shop/provider-account',
    { provider: 'fake', credentials: { account } },
    tenant.slug,
  )

describe("the seller's details", () => {
  it('are empty and incomplete until they are set, in PLN', async () => {
    const t = await tenantWithHead()

    const res = await call(t.head, 'get', '/shop/seller', undefined, t.slug).expect(200)

    expect(res.body).toEqual({
      sellerName: null,
      sellerAddress: null,
      sellerRegistrationNumber: null,
      contactEmail: null,
      currency: 'PLN',
      complete: false,
    })
  })

  it('are complete once every part is set, and incomplete again with one cleared', async () => {
    const t = await tenantWithHead()

    const set = await call(t.head, 'put', '/shop/seller', seller, t.slug).expect(200)
    // The one currency the contract names for every amount of a shop.
    expect(SHOP_CURRENCY).toBe('PLN')
    expect(set.body).toEqual({ ...seller, currency: SHOP_CURRENCY, complete: true })
    expect((await call(t.head, 'get', '/shop/seller', undefined, t.slug)).body).toEqual(set.body)

    const cleared = await call(
      t.head,
      'put',
      '/shop/seller',
      { ...seller, sellerRegistrationNumber: null },
      t.slug,
    ).expect(200)
    expect(cleared.body).toMatchObject({ sellerRegistrationNumber: null, complete: false })
  })

  it('are read with shop read access and set only with write access', async () => {
    const t = await tenantWithHead()
    const reader = await member()
    await addOrg(t.id, reader, { shop: 'read', settings: 'write' })

    await call(reader, 'get', '/shop/seller', undefined, t.slug).expect(200)
    const refused = await call(reader, 'put', '/shop/seller', seller, t.slug)

    expect(refused.status).toBe(403)
    expect((await call(t.head, 'get', '/shop/seller', undefined, t.slug)).body).toMatchObject({
      sellerName: null,
    })
  })

  it("are a convention's own: another convention reads its own", async () => {
    await call(a.head, 'put', '/shop/seller', seller).expect(200)

    const other = await call(b.head, 'get', '/shop/seller', undefined, b.slug).expect(200)

    expect(other.body).toMatchObject({ sellerName: null, complete: false })
  })

  it('cannot be made incomplete while a shop of the convention is open, and can once it is closed', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    await call(t.head, 'put', '/shop/seller', seller, t.slug).expect(200)
    await openShop(t.id, edition)

    const refused = await call(
      t.head,
      'put',
      '/shop/seller',
      { ...seller, contactEmail: null },
      t.slug,
    )
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'shop.open' })
    // A change that keeps them complete goes through.
    await call(t.head, 'put', '/shop/seller', { ...seller, sellerName: 'Renamed' }, t.slug).expect(
      200,
    )

    await closeShop(edition)
    await call(t.head, 'put', '/shop/seller', { ...seller, contactEmail: null }, t.slug).expect(200)
  })

  it.each([
    ['a part left out', { sellerName: undefined }],
    ['an empty part', { sellerAddress: ' ' }],
    ['a contact that is no email address', { contactEmail: 'shop' }],
  ])('refuse %s', async (_, change) => {
    const res = await call(a.head, 'put', '/shop/seller', { ...seller, ...change })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })
})

describe('the provider account', () => {
  it('is none until one is connected', async () => {
    const t = await tenantWithHead()

    const res = await call(t.head, 'get', '/shop/provider-account', undefined, t.slug).expect(200)

    expect(res.body).toEqual({ account: null, providers: ['fake', 'przelewy24'] })
  })

  it('connects with credentials the provider accepts, ready to sell, and never answers them', async () => {
    const t = await tenantWithHead()

    const res = await connect(t, 'my-secret-account').expect(200)

    expect(res.body).toEqual({
      account: {
        provider: 'fake',
        connectedAt: expect.any(String) as string,
        ready: true,
        missing: [],
      },
      // The providers this environment has a module of: what the panel offers to connect.
      providers: ['fake', 'przelewy24'],
    })
    expect(JSON.stringify(res.body)).not.toContain('my-secret-account')
    const read = await call(t.head, 'get', '/shop/provider-account', undefined, t.slug).expect(200)
    expect(read.body).toEqual(res.body)
    expect(JSON.stringify(read.body)).not.toContain('my-secret-account')
  })

  it('stores the credentials sealed with the key the API alone holds', async () => {
    const t = await tenantWithHead()
    await connect(t, 'my-secret-account').expect(200)

    const stored = (await storedProviderAccount(t.id))!

    expect(stored.provider).toBe('fake')
    expect(stored.readyAt).not.toBeNull()
    expect(stored.credentials).not.toContain('my-secret-account')
    expect(JSON.parse(opened(t.id, stored.credentials))).toEqual({
      account: 'my-secret-account',
    })
  })

  it('seals them for their convention: copied into the row of another, they open nothing', async () => {
    const [mine, theirs] = await Promise.all([tenantWithHead(), tenantWithHead()])
    await connect(mine, 'my-secret-account').expect(200)
    const stored = (await storedProviderAccount(mine.id))!

    expect(() => opened(theirs.id, stored.credentials)).toThrow(/could not be opened/)
    // Moved there by a hand that writes the database, the account is one that cannot sell.
    await moveProviderAccount(mine.id, theirs.id)
    const read = await call(theirs.head, 'get', '/shop/provider-account', undefined, theirs.slug)
    expect(read.body).toMatchObject({
      account: { ready: false, missing: ['credentials.unreadable'] },
    })
  })

  it('connects an account that is not ready yet, and names what it misses', async () => {
    const t = await tenantWithHead()

    const res = await connect(t, FAKE_ACCOUNT.notReady).expect(200)

    expect(res.body).toMatchObject({ account: { ready: false, missing: ['fake.not-ready'] } })
    expect((await storedProviderAccount(t.id))!.readyAt).toBeNull()
    const read = await call(t.head, 'get', '/shop/provider-account', undefined, t.slug)
    expect(read.body).toEqual(res.body)
  })

  it('stores nothing of credentials the provider refuses, and keeps the account it had', async () => {
    const t = await tenantWithHead()
    const fresh = await connect(t, FAKE_ACCOUNT.refused)
    expect(fresh.status).toBe(422)
    expect(fresh.body).toMatchObject({ code: 'provider.credentials-refused' })
    expect(await storedProviderAccount(t.id)).toBeUndefined()

    await connect(t, 'first').expect(200)
    const before = await storedProviderAccount(t.id)
    await connect(t, FAKE_ACCOUNT.refused).expect(422)

    expect(await storedProviderAccount(t.id)).toEqual(before)
  })

  it('stores nothing when the provider is out of reach, and says so', async () => {
    const t = await tenantWithHead()

    const res = await connect(t, FAKE_ACCOUNT.unavailable)

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    expect(await storedProviderAccount(t.id)).toBeUndefined()
  })

  it('replaces the stored credentials with new ones, after the same check', async () => {
    const t = await tenantWithHead()
    await connect(t, 'first').expect(200)
    const before = (await storedProviderAccount(t.id))!

    await connect(t, FAKE_ACCOUNT.notReady).expect(200)

    const after = (await storedProviderAccount(t.id))!
    expect(after.credentials).not.toBe(before.credentials)
    expect(after.readyAt).toBeNull()
    expect(JSON.parse(opened(t.id, after.credentials))).toEqual({
      account: FAKE_ACCOUNT.notReady,
    })
  })

  it.each([
    ['no credentials', { provider: 'fake' }],
    ['a provider OPOS does not know', { provider: 'cash', credentials: { a: 'b' } }],
    ['a field of its own', { provider: 'fake', credentials: { a: 'b' }, ready: true }],
  ])('refuses %s', async (_, body) => {
    const res = await call(a.head, 'put', '/shop/provider-account', body)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })

  it('is read with shop read access, and connected only with write access', async () => {
    const t = await tenantWithHead()
    const reader = await member()
    await addOrg(t.id, reader, { shop: 'read' })

    await call(reader, 'get', '/shop/provider-account', undefined, t.slug).expect(200)
    const refused = await call(
      reader,
      'put',
      '/shop/provider-account',
      { provider: 'fake', credentials: { account: 'demo' } },
      t.slug,
    )

    expect(refused.status).toBe(403)
    expect(await storedProviderAccount(t.id)).toBeUndefined()
  })

  it("is a convention's own: another convention has none", async () => {
    await connect(a).expect(200)

    const other = await call(b.head, 'get', '/shop/provider-account', undefined, b.slug)

    expect(other.body).toEqual({ account: null, providers: ['fake', 'przelewy24'] })
  })

  it('is disconnected with 204, its credentials removed, and disconnecting none answers the same', async () => {
    const t = await tenantWithHead()
    await connect(t).expect(200)

    const res = await call(t.head, 'delete', '/shop/provider-account', undefined, t.slug).expect(
      204,
    )

    expect(res.body).toEqual({})
    expect(await storedProviderAccount(t.id)).toBeUndefined()
    await call(t.head, 'delete', '/shop/provider-account', undefined, t.slug).expect(204)
  })

  it('carries nothing of the credentials in a refusal or a failure', async () => {
    const t = await tenantWithHead()
    const call_ = (extra: string) =>
      call(
        t.head,
        'put',
        '/shop/provider-account',
        { provider: 'fake', credentials: { account: extra, secret: 'never-in-an-answer' } },
        t.slug,
      )

    const refused = await call_(FAKE_ACCOUNT.refused)
    const unavailable = await call_(FAKE_ACCOUNT.unavailable)

    expect(refused.status).toBe(422)
    expect(unavailable.status).toBe(503)
    for (const res of [refused, unavailable]) {
      expect(JSON.stringify(res.body)).not.toContain('never-in-an-answer')
      expect(Object.keys(res.body as object).sort()).toEqual(['code', 'message'])
    }
  })

  it('asks the provider nothing for an actor the route refuses', async () => {
    const t = await tenantWithHead()
    const [reader, outsider] = await Promise.all([member(), member()])
    await addOrg(t.id, reader, { shop: 'read', settings: 'write' })
    const asked = vi.spyOn(FakeProvider.prototype, 'connect')

    try {
      for (const who of [reader, outsider]) {
        const res = await call(
          who,
          'put',
          '/shop/provider-account',
          { provider: 'fake', credentials: { account: FAKE_ACCOUNT.unavailable } },
          t.slug,
        )
        // 403 and not the provider's 503: the call out comes after the check, never before.
        expect(res.status).toBe(403)
      }
      expect(asked).not.toHaveBeenCalled()
    } finally {
      asked.mockRestore()
    }
  })

  it('answers a provider that fails outright as one out of reach, and stores nothing', async () => {
    const t = await tenantWithHead()
    const failing = vi
      .spyOn(FakeProvider.prototype, 'connect')
      .mockRejectedValue(new Error('socket hang up with key=my-secret-account'))

    try {
      const res = await connect(t, 'my-secret-account')

      expect(res.status).toBe(503)
      expect(res.body).toMatchObject({ code: 'provider.unavailable' })
      expect(JSON.stringify(res.body)).not.toContain('my-secret-account')
      expect(await storedProviderAccount(t.id)).toBeUndefined()
    } finally {
      failing.mockRestore()
    }
  })

  it('says of credentials it can no longer open that the account is not ready, and still answers', async () => {
    const t = await tenantWithHead()
    // Sealed with a key this API does not hold, as after the key was replaced.
    await addProviderAccount(t.id)

    const res = await call(t.head, 'get', '/shop/provider-account', undefined, t.slug).expect(200)

    expect(res.body).toMatchObject({
      account: { provider: 'fake', ready: false, missing: ['credentials.unreadable'] },
    })
    // Connecting again takes the place of what could not be opened.
    await connect(t).expect(200)
    const read = await call(t.head, 'get', '/shop/provider-account', undefined, t.slug)
    expect(read.body).toMatchObject({ account: { ready: true, missing: [] } })
  })

  it('checks credentials with the provider only so often for one convention', async () => {
    const t = await tenantWithHead()
    const { limit } = ROUTE_RATE_LIMITS.providerConnects
    for (let sent = 0; sent < limit; sent += 1) await connect(t).expect(200)
    const before = await storedProviderAccount(t.id)
    const asked = vi.spyOn(FakeProvider.prototype, 'connect')

    try {
      const res = await connect(t, FAKE_ACCOUNT.notReady)

      expect(res.status).toBe(429)
      expect(res.body).toMatchObject({ code: 'request.rate-limited' })
      expect(res.headers['retry-after']).toBeDefined()
      expect(asked).not.toHaveBeenCalled()
      expect(await storedProviderAccount(t.id)).toEqual(before)
    } finally {
      asked.mockRestore()
    }
  })

  it('cannot be replaced by an account that is not ready while a shop of the convention is open', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    await connect(t).expect(200)
    await openShop(t.id, edition)
    const before = await storedProviderAccount(t.id)

    const refused = await connect(t, FAKE_ACCOUNT.notReady)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'shop.open' })
    expect(await storedProviderAccount(t.id)).toEqual(before)
    // Credentials that keep the account ready take the place of the stored ones.
    await connect(t, 'other').expect(200)

    await closeShop(edition)
    await connect(t, FAKE_ACCOUNT.notReady).expect(200)
  })

  it('cannot be disconnected while a shop of the convention is open', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    await connect(t).expect(200)
    await openShop(t.id, edition)

    const refused = await call(t.head, 'delete', '/shop/provider-account', undefined, t.slug)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'shop.open' })
    expect(await storedProviderAccount(t.id)).toBeDefined()

    await closeShop(edition)
    await call(t.head, 'delete', '/shop/provider-account', undefined, t.slug).expect(204)
  })
})
