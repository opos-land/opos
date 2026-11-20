import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type EnabledScanner, MAX_SCANNERS, type Scanner } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  addScanner,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  storedRows,
  tenantWithHead,
} from './tenants'

// The scanners of an edition as an org manages them (docs/specs/0007-scanner.md, D2-D11): an org
// with tickets write access enables one and is shown its pairing code once, and any such org
// revokes any of them.

type Method = 'get' | 'post' | 'delete'

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

const DAY = 24 * 60 * 60_000
const ENDS = '2027-06-03T16:00:00.000Z'
const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex')

/** A tenant of its own with one edition that ends on a known day. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id, { endsAt: ENDS })
  const as = (who: Member, method: Method, path = '', body?: object) => {
    const agent = request(app.getHttpServer())
    const req = agent[method](`/editions/${edition}/scanners${path}`)
      .use(session(who.token))
      .set('X-Tenant-Slug', t.slug)
    return body ? req.send(body) : req
  }
  const head = (method: Method, path = '', body?: object) => as(t.head, method, path, body)
  const stored = async () => storedRows('scanner_devices', t.id)
  return { t, edition, as, head, stored }
}

const enabled = (res: { body: unknown }) => res.body as EnabledScanner
const list = (res: { body: unknown }) => res.body as Scanner[]

describe('enabling a scanner', () => {
  it('names it and shows its pairing code once, of which only the hash is kept', async () => {
    const c = await convention()
    const before = Date.now()

    const res = await c.head('post', '', { name: ' Main gate ' }).expect(201)

    const scanner = enabled(res)
    expect(scanner).toMatchObject({
      name: 'Main gate',
      enabledBy: c.t.head.email,
      paired: false,
      lastUsedAt: null,
      revokedAt: null,
      // A day after the edition's last day.
      expiresAt: new Date(Date.parse(ENDS) + DAY).toISOString(),
    })
    expect(scanner.pairingCode).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const minutes = (Date.parse(scanner.pairingExpiresAt) - before) / 60_000
    expect(minutes).toBeGreaterThan(14.9)
    expect(minutes).toBeLessThan(15.1)
    const [row] = await c.stored()
    expect(row).toMatchObject({
      pairing_code_hash: hashOf(scanner.pairingCode),
      paired_at: null,
      token_hash: null,
    })
    // The code is answered once: the list never holds it.
    const listed = await c.head('get').expect(200)
    expect(list(listed)).toEqual([
      expect.objectContaining({ id: scanner.id, name: 'Main gate', paired: false }),
    ])
    expect(JSON.stringify(listed.body)).not.toMatch(/pairing|token|hash/i)
  })

  it('refuses a name another scanner of the edition has, until that one is revoked', async () => {
    const c = await convention()
    const sibling = await addEdition(c.t.id)
    await addScanner(c.t.id, sibling, { name: 'Main gate' })
    const first = enabled(await c.head('post', '', { name: 'Main gate' }).expect(201))

    const taken = await c.head('post', '', { name: 'Main gate' }).expect(409)

    expect(taken.body).toMatchObject({ code: 'scanner.name-taken' })
    await c.head('delete', `/${first.id}`).expect(200)
    await c.head('post', '', { name: 'Main gate' }).expect(201)
  })

  it(`allows ${MAX_SCANNERS} scanners enabled at a time: a revoked and an ended one count no more`, async () => {
    const c = await convention()
    for (let n = 1; n < MAX_SCANNERS; n += 1) await addScanner(c.t.id, c.edition)
    await addScanner(c.t.id, c.edition, { revoked: true })
    await addScanner(c.t.id, c.edition, { expiresAt: new Date(Date.now() - DAY).toISOString() })
    const last = enabled(await c.head('post', '', { name: 'The twentieth' }).expect(201))

    const res = await c.head('post', '', { name: 'One too many' }).expect(409)

    expect(res.body).toMatchObject({
      code: 'scanner.limit-reached',
      params: { limit: MAX_SCANNERS },
    })
    await c.head('delete', `/${last.id}`).expect(200)
    await c.head('post', '', { name: 'In its place' }).expect(201)
  })

  it('ends when the org says, never later than a day after the edition', async () => {
    const c = await convention()
    const earlier = new Date(Date.parse(ENDS) - DAY).toISOString()

    const res = await c.head('post', '', { name: 'Desk', expiresAt: earlier }).expect(201)

    expect(enabled(res).expiresAt).toBe(earlier)
    for (const expiresAt of [
      new Date(Date.parse(ENDS) + 2 * DAY).toISOString(),
      new Date(Date.now() - DAY).toISOString(),
    ]) {
      const refused = await c.head('post', '', { name: 'Late', expiresAt }).expect(400)
      expect(refused.body).toMatchObject({
        code: 'request.invalid',
        params: { field: 'expiresAt' },
      })
    }
  })

  // A scanner's access ends no later than that of the org who enabled it.
  it('ends with the access of the org who enables it, and is refused a later end', async () => {
    const c = await convention()
    const org = await member()
    const leaves = new Date(Date.now() + 30 * DAY)
    const orgId = await addOrg(c.t.id, org, { expiresAt: leaves })
    await addEditionAccess(c.t.id, orgId, c.edition, { tickets: 'write' })

    const res = await c.as(org, 'post', '', { name: 'Gate of the org' }).expect(201)

    expect(enabled(res)).toMatchObject({
      enabledBy: org.email,
      expiresAt: leaves.toISOString(),
    })
    const later = new Date(leaves.getTime() + DAY).toISOString()
    const refused = await c.as(org, 'post', '', { name: 'Later', expiresAt: later }).expect(422)
    expect(refused.body).toMatchObject({ code: 'scanner.outlives-org' })
  })
})

// Who is in the team, and under which address, is behind the settings permission: an org who
// reads the tickets of an edition alone is told of a scanner only that another org enabled it.
describe('who enabled a scanner', () => {
  it('is an address for an org who may read the team, and for the org’s own scanner alone otherwise', async () => {
    const c = await convention()
    await addScanner(c.t.id, c.edition, { name: 'Gate of the head' })
    const [gatekeeper, manager] = [await member(), await member()]
    const gatekeeperId = await addOrg(c.t.id, gatekeeper)
    await addEditionAccess(c.t.id, gatekeeperId, c.edition, { tickets: 'write' })
    await addEditionAccess(c.t.id, await addOrg(c.t.id, manager, { settings: 'read' }), c.edition, {
      tickets: 'read',
    })
    await c.as(gatekeeper, 'post', '', { name: 'Gate of the org' }).expect(201)
    const who = async (reader: typeof gatekeeper) =>
      Object.fromEntries(
        list(await c.as(reader, 'get').expect(200)).map((scanner) => [
          scanner.name,
          scanner.enabledBy,
        ]),
      )

    expect(await who(gatekeeper)).toEqual({
      'Gate of the head': null,
      'Gate of the org': gatekeeper.email,
    })
    const all = { 'Gate of the head': c.t.head.email, 'Gate of the org': gatekeeper.email }
    expect(await who(manager)).toEqual(all)
    expect(await who(c.t.head)).toEqual(all)
  })
})

describe('the scanners of an edition', () => {
  it('are listed with who enabled each, when it was last used and when it ends', async () => {
    const c = await convention()
    const sibling = await addEdition(c.t.id)
    await addScanner(c.t.id, c.edition, { name: 'B gate' })
    await addScanner(c.t.id, c.edition, { name: 'A gate', revoked: true })
    await addScanner(c.t.id, c.edition, { name: 'C gate', membershipId: null })
    await addScanner(c.t.id, sibling, { name: 'Elsewhere' })

    const res = await c.head('get').expect(200)

    // Those that still stand first, by name.
    expect(list(res).map((scanner) => [scanner.name, scanner.enabledBy, scanner.paired])).toEqual([
      ['B gate', c.t.head.email, true],
      ['C gate', null, true],
      ['A gate', c.t.head.email, true],
    ])
    expect(list(res)[2]!.revokedAt).not.toBeNull()
  })
})

describe('revoking a scanner', () => {
  it('is any org’s with tickets write access, whoever enabled it', async () => {
    const c = await convention()
    const org = await member()
    await addEditionAccess(c.t.id, await addOrg(c.t.id, org), c.edition, { tickets: 'write' })
    const scanner = await addScanner(c.t.id, c.edition, { name: 'Main gate' })

    const res = await c.as(org, 'delete', `/${scanner.id}`).expect(200)

    expect((res.body as Scanner).revokedAt).not.toBeNull()
    // Revoked, it stays revoked as it was.
    const again = await c.head('delete', `/${scanner.id}`).expect(200)
    expect((again.body as Scanner).revokedAt).toBe((res.body as Scanner).revokedAt)
  })

  it('knows the scanners of its own edition alone', async () => {
    const c = await convention()
    const other = await convention()
    const sibling = await addEdition(c.t.id)
    const elsewhere = await addScanner(c.t.id, sibling)
    const foreign = await addScanner(other.t.id, other.edition)

    for (const id of [elsewhere.id, foreign.id, 'no-identifier']) {
      await c.head('delete', `/${id}`).expect(404)
    }
    expect((await other.stored())[0]!.revoked_at).toBeNull()
  })
})
