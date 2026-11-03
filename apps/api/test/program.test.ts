import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { MAX_PROGRAM_ITEMS } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { tenantWriteLockKey } from '../src/common/permissions/tenant-write-lock'
import { createAccount, deleteCreatedAccounts, session, testEmail } from './auth'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  addProgramItems,
  closeTenantDb,
  deleteCreatedTenants,
  holdOpen,
  member,
  type Member,
  openTransaction,
  sleep,
  tenantWithHead,
} from './tenants'

// Programme items and their speakers (PLAN.md 5.5). Which permission each route needs is checked
// in route-requirements.test.ts; these cover what the routes do.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface Item {
  id: string
  editionId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  speakers: { id: string; email: string; firstName: string | null; lastName: string | null }[]
}

let app: NestExpressApplication
let a: Tenant
let b: Tenant
let edition: string
let otherEdition: string
let foreignEdition: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  ;[edition, otherEdition, foreignEdition] = await Promise.all([
    addEdition(a.id),
    addEdition(a.id),
    addEdition(b.id),
  ])
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

const itemsOf = (editionId: string) => `/editions/${editionId}/program-items`
const itemPath = (editionId: string, itemId: string) => `${itemsOf(editionId)}/${itemId}`
const speakersOf = (editionId: string, itemId: string) => `${itemPath(editionId, itemId)}/speakers`

const valid = {
  title: 'Opening ceremony',
  startsAt: '2027-06-01T09:00:00.000Z',
  endsAt: '2027-06-01T10:00:00.000Z',
}

const create = async (body: object = {}, editionId = edition) =>
  (await call(a.head, 'post', itemsOf(editionId), { ...valid, ...body }).expect(201)).body as Item

const list = async (editionId = edition) =>
  (await call(a.head, 'get', itemsOf(editionId)).expect(200)).body as Item[]

const stored = async (itemId: string, editionId = edition) =>
  (await list(editionId)).find((item) => item.id === itemId)

/** An item with a speaker, so a request that wrongly reached it would show in what is stored. */
async function createWithSpeaker(editionId = edition) {
  const item = await create({}, editionId)
  const speaker = await createAccount()
  await call(a.head, 'put', speakersOf(editionId, item.id), { emails: [speaker.email] }).expect(200)
  return (await stored(item.id, editionId))!
}

describe('programme items', () => {
  it('creates an item and lists the edition by start time', async () => {
    const fresh = await addEdition(a.id)
    const later = await create(
      { title: 'Later', startsAt: '2027-06-01T11:00:00Z', endsAt: '2027-06-01T12:00:00Z' },
      fresh,
    )
    const earlier = await create({ title: 'Earlier' }, fresh)

    expect(earlier).toEqual({
      id: expect.any(String) as string,
      editionId: fresh,
      title: 'Earlier',
      description: null,
      startsAt: valid.startsAt,
      endsAt: valid.endsAt,
      speakers: [],
    })
    expect((await list(fresh)).map((item) => item.id)).toEqual([earlier.id, later.id])
  })

  it('lets an org with program=write create an item in its edition', async () => {
    const org = await member()
    await addEditionAccess(a.id, await addOrg(a.id, org), edition, { program: 'write' })

    const res = await call(org, 'post', itemsOf(edition), valid).expect(201)

    expect(await stored((res.body as Item).id)).toMatchObject({ title: valid.title })
  })

  it.each([
    ['a title of 2 characters', { title: 'ab' }, 'title'],
    ['a title of 2 characters around spaces', { title: '  ab  ' }, 'title'],
    ['a title of 201 characters', { title: 'x'.repeat(201) }, 'title'],
    ['a description of 5001 characters', { description: 'x'.repeat(5001) }, 'description'],
    ['an end equal to the start', { endsAt: valid.startsAt }, 'endsAt'],
    ['an end before the start', { endsAt: '2027-06-01T08:00:00Z' }, 'endsAt'],
    ['an unknown field', { room: 'A' }, undefined],
  ])('refuses %s', async (_, body, field) => {
    const before = await list()
    const res = await call(a.head, 'post', itemsOf(edition), { ...valid, ...body }).expect(400)

    expect(res.body).toMatchObject({
      code: 'request.invalid',
      ...(field && { params: { field } }),
    })
    expect(await list()).toEqual(before)
  })

  it('takes no more items than an edition may hold, whichever edition is full', async () => {
    const full = await addEdition(a.id)
    await addProgramItems(a.id, full, MAX_PROGRAM_ITEMS - 1)

    await create({}, full)
    const res = await call(a.head, 'post', itemsOf(full), valid).expect(409)

    expect(res.body).toMatchObject({
      code: 'program.too-many-items',
      params: { limit: MAX_PROGRAM_ITEMS },
    })
    await create({}, await addEdition(a.id))
  })

  it('accepts the longest title and description', async () => {
    const item = await create({ title: 'x'.repeat(200), description: 'y'.repeat(5000) })

    expect(item.title).toHaveLength(200)
    expect(item.description).toHaveLength(5000)
  })

  it('changes only the fields a patch sends, and clears a description with null', async () => {
    const item = await create({ description: 'Before' })

    const changed = await call(a.head, 'patch', itemPath(edition, item.id), {
      title: 'Renamed',
    }).expect(200)
    expect(changed.body).toEqual({ ...item, title: 'Renamed' })

    const cleared = await call(a.head, 'patch', itemPath(edition, item.id), {
      description: null,
    }).expect(200)
    expect(cleared.body).toEqual({ ...item, title: 'Renamed', description: null })
  })

  it('answers an empty patch with the item as it is', async () => {
    const item = await create()

    const res = await call(a.head, 'patch', itemPath(edition, item.id), {}).expect(200)

    expect(res.body).toEqual(item)
  })

  it('refuses a patch whose end falls before the stored start', async () => {
    const item = await create()

    const res = await call(a.head, 'patch', itemPath(edition, item.id), {
      endsAt: '2027-06-01T08:00:00Z',
    }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'endsAt' } })
    expect(await stored(item.id)).toEqual(item)
  })

  it('deletes an item with its speakers, and answers 404 the second time', async () => {
    const item = await create()
    const speaker = await createAccount()
    await call(a.head, 'put', speakersOf(edition, item.id), { emails: [speaker.email] }).expect(200)

    await call(a.head, 'delete', itemPath(edition, item.id)).expect(204)

    expect(await stored(item.id)).toBeUndefined()
    await call(a.head, 'delete', itemPath(edition, item.id)).expect(404)
  })
})

describe('isolation', () => {
  const attempts: [string, Method, (editionId: string, itemId: string) => string, object?][] = [
    ['a patch', 'patch', itemPath, { title: 'Stolen' }],
    ['a delete', 'delete', itemPath],
    ['a change of speakers', 'put', speakersOf, { emails: [] }],
  ]

  it.each(attempts)(
    'refuses %s of an item through another edition of the tenant',
    async (_, method, path, body) => {
      const item = await createWithSpeaker()

      const res = await call(a.head, method, path(otherEdition, item.id), body).expect(404)

      expect(res.body).toMatchObject({ code: 'request.not-found' })
      expect(await stored(item.id)).toEqual(item)
    },
  )

  it.each(attempts)(
    'holds an org to its edition on %s, through either path',
    async (_, method, path, body) => {
      const org = await member()
      await addEditionAccess(a.id, await addOrg(a.id, org), edition, { program: 'write' })
      const item = await createWithSpeaker(otherEdition)

      // Its own edition's path reaches no item of the other; the other's path needs a permission.
      await call(org, method, path(edition, item.id), body).expect(404)
      await call(org, method, path(otherEdition, item.id), body).expect(403)

      expect(await stored(item.id, otherEdition)).toEqual(item)
    },
  )

  it.each(attempts)(
    'refuses %s of an item of another tenant through an own edition',
    async (_, method, path, body) => {
      const foreign = await call(b.head, 'post', itemsOf(foreignEdition), valid, b.slug).expect(201)
      const speaker = await createAccount()
      const named = await call(
        b.head,
        'put',
        speakersOf(foreignEdition, (foreign.body as Item).id),
        { emails: [speaker.email] },
        b.slug,
      ).expect(200)
      const item = named.body as Item

      await call(a.head, method, path(edition, item.id), body).expect(404)

      const left = await call(b.head, 'get', itemsOf(foreignEdition), undefined, b.slug).expect(200)
      expect((left.body as Item[]).find(({ id }) => id === item.id)).toEqual(item)
    },
  )

  it('answers 404 for the edition of another tenant', async () => {
    await call(a.head, 'get', itemsOf(foreignEdition)).expect(404)
    await call(a.head, 'post', itemsOf(foreignEdition), valid).expect(404)
  })

  it('lists only the items of the edition', async () => {
    const here = await create()
    const there = await create({}, otherEdition)

    const ids = (await list()).map((item) => item.id)

    expect(ids).toContain(here.id)
    expect(ids).not.toContain(there.id)
  })

  it.each(attempts)(
    'answers 404 to %s with an id that is not a uuid',
    async (_, method, path, body) => {
      await call(a.head, method, path(edition, 'not-a-uuid'), body).expect(404)
    },
  )

  it.each(attempts)('answers 404 to %s of an unknown item', async (_, method, path, body) => {
    await call(a.head, method, path(edition, randomUUID()), body).expect(404)
  })

  // The API deletes an edition under the tenant's write lock, so this holds both.
  it('answers 404 to a write once the delete of its edition commits while it waits', async () => {
    const doomed = await addEdition(a.id)
    const holder = await openTransaction()
    await holder.sql`select pg_advisory_xact_lock(${tenantWriteLockKey(a.id)}::bigint)`
    await holder.sql`delete from editions where id = ${doomed}`

    const pending = call(a.head, 'post', itemsOf(doomed), valid).then((res) => res)
    await sleep(300)
    await holder.commit()

    expect((await pending).status).toBe(404)
  })
})

describe('speakers', () => {
  const put = (itemId: string, emails: string[]) =>
    call(a.head, 'put', speakersOf(edition, itemId), { emails })

  const emailsOf = (item: Item | undefined) => item?.speakers.map((speaker) => speaker.email)

  it('replaces the list with the accounts named, who need no membership', async () => {
    const item = await create()
    const other = await createWithSpeaker()
    const [first, second, third] = await Promise.all([
      createAccount(),
      createAccount(),
      createAccount(),
    ])

    const res = await put(item.id, [first.email, second.email]).expect(200)
    expect((res.body as Item).id).toBe(item.id)
    expect(emailsOf(res.body as Item)!.sort()).toEqual([first.email, second.email].sort())

    await put(item.id, [second.email, third.email]).expect(200)
    expect(emailsOf(await stored(item.id))!.sort()).toEqual([second.email, third.email].sort())
    expect(await stored(other.id)).toEqual(other)
  })

  it('shows a speaker by account, with the names', async () => {
    const item = await create()
    const speaker = await createAccount({ first_name: 'Kasia', last_name: 'Mazur' })

    const res = await put(item.id, [speaker.email]).expect(200)

    expect((res.body as Item).speakers).toEqual([
      { id: speaker.id, email: speaker.email, firstName: 'Kasia', lastName: 'Mazur' },
    ])
  })

  it('counts an address once, whatever its case', async () => {
    const item = await create()
    const speaker = await createAccount()

    await put(item.id, [speaker.email, speaker.email.toUpperCase()]).expect(200)

    expect(emailsOf(await stored(item.id))).toEqual([speaker.email])
  })

  it('clears the list with an empty one', async () => {
    const item = await create()
    const speaker = await createAccount()
    await put(item.id, [speaker.email]).expect(200)

    await put(item.id, []).expect(200)

    expect(emailsOf(await stored(item.id))).toEqual([])
  })

  it('changes nothing when one address has no account', async () => {
    const item = await create()
    const speaker = await createAccount()
    await put(item.id, [speaker.email]).expect(200)
    const missing = testEmail('missing')

    const res = await put(item.id, [speaker.email, missing]).expect(404)

    expect(res.body).toMatchObject({
      code: 'speaker.account-not-found',
      params: { email: missing },
    })
    expect(emailsOf(await stored(item.id))).toEqual([speaker.email])
  })

  it('treats an account with an unconfirmed email as no account', async () => {
    const item = await create()
    const unconfirmed = await createAccount({}, { confirmed: false })

    const res = await put(item.id, [unconfirmed.email]).expect(404)

    expect(res.body).toMatchObject({ code: 'speaker.account-not-found' })
  })

  // An account deletion runs without the tenant's write lock, so it can land after the lookup.
  it('answers 404 for an account deleted while the list is written', async () => {
    const item = await create()
    const speaker = await createAccount()
    const commit = await holdOpen((sql) => sql`delete from accounts where id = ${speaker.id}`)

    const pending = put(item.id, [speaker.email]).then((res) => res)
    await sleep(300)
    await commit()

    const res = await pending
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({
      code: 'speaker.account-not-found',
      params: { email: speaker.email },
    })
    expect(emailsOf(await stored(item.id))).toEqual([])
  })

  it('takes up to 10 speakers', async () => {
    const item = await create()
    const accounts = await Promise.all(Array.from({ length: 11 }, () => createAccount()))
    const emails = accounts.map((account) => account.email)

    await put(item.id, emails.slice(0, 10)).expect(200)
    const res = await put(item.id, emails).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'emails' } })
    expect(await stored(item.id).then((row) => row?.speakers.length)).toBe(10)
  })

  it('refuses something that is not an address', async () => {
    const item = await create()

    const res = await put(item.id, ['not-an-address']).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })

  it('lets one account speak in two tenants', async () => {
    const speaker = await createAccount()
    const here = await create()
    const there = (await call(b.head, 'post', itemsOf(foreignEdition), valid, b.slug).expect(201))
      .body as Item

    await put(here.id, [speaker.email]).expect(200)
    await call(
      b.head,
      'put',
      speakersOf(foreignEdition, there.id),
      { emails: [speaker.email] },
      b.slug,
    ).expect(200)

    expect(emailsOf(await stored(here.id))).toEqual([speaker.email])
  })

  describe('the limit of new addresses', () => {
    const missing = (count: number) => Array.from({ length: count }, () => testEmail('missing'))

    /** A tenant with an edition and an item, whose limit no other test spends. */
    async function fresh() {
      const t = await tenantWithHead()
      const editionId = await addEdition(t.id)
      const created = await call(t.head, 'post', itemsOf(editionId), valid, t.slug).expect(201)
      const path = speakersOf(editionId, (created.body as Item).id)
      return {
        t,
        editionId,
        path,
        send: (emails: string[]) => call(t.head, 'put', path, { emails }, t.slug),
      }
    }

    /** Spends `count` of the limit on addresses without an account, 10 to a request. */
    async function spend(send: (emails: string[]) => ReturnType<typeof call>, count: number) {
      for (let left = count; left > 0; left -= 10) {
        await send(missing(Math.min(left, 10))).expect(404)
      }
    }

    it('counts an address without an account, then answers 429', async () => {
      const { send } = await fresh()
      await spend(send, ROUTE_RATE_LIMITS.speakers.limit)

      const res = await send(missing(1)).expect(429)

      expect(res.body).toMatchObject({ code: 'request.rate-limited' })
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    })

    it('counts nothing for an address already a speaker in the edition, or for a removal', async () => {
      const { send } = await fresh()
      const [speaker, another] = await Promise.all([createAccount(), createAccount()])
      await spend(send, ROUTE_RATE_LIMITS.speakers.limit - 1)
      await send([speaker.email]).expect(200)

      await send([speaker.email]).expect(200)
      await send([]).expect(200)

      // The speaker left the list above, so naming them again counts as new.
      await send([another.email]).expect(429)
    })

    // Free across editions, it would tell an org who speaks in an edition it may not read.
    it('counts a speaker of another edition of the tenant as new', async () => {
      const { t, send } = await fresh()
      const otherId = await addEdition(t.id)
      const other = await call(t.head, 'post', itemsOf(otherId), valid, t.slug).expect(201)
      const speaker = await createAccount()
      await call(
        t.head,
        'put',
        speakersOf(otherId, (other.body as Item).id),
        { emails: [speaker.email] },
        t.slug,
      ).expect(200)
      await spend(send, ROUTE_RATE_LIMITS.speakers.limit - 1)

      await send([speaker.email]).expect(429)
    })

    it('keeps one count for the whole team of a tenant', async () => {
      const { t, editionId, path, send } = await fresh()
      const org = await member()
      await addEditionAccess(t.id, await addOrg(t.id, org), editionId, { program: 'write' })
      await spend(send, ROUTE_RATE_LIMITS.speakers.limit)

      await call(org, 'put', path, { emails: missing(1) }, t.slug).expect(429)
    })

    it('counts nothing for a request refused by its permission', async () => {
      const { t, editionId, path, send } = await fresh()
      const reader = await member()
      await addEditionAccess(t.id, await addOrg(t.id, reader), editionId, { program: 'read' })
      const requests = Math.ceil(ROUTE_RATE_LIMITS.speakers.limit / 10)
      for (let sent = 0; sent <= requests; sent++) {
        await call(reader, 'put', path, { emails: missing(10) }, t.slug).expect(403)
      }

      await send(missing(1)).expect(404)
    })

    it('keeps one count per tenant', async () => {
      const [first, second] = await Promise.all([fresh(), fresh()])
      await spend(first.send, ROUTE_RATE_LIMITS.speakers.limit)

      await second.send(missing(1)).expect(404)
    })
  })
})
