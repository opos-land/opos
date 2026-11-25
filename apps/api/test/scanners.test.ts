import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type EnabledScanner, MAX_SCANNERS, type Scanner, type ScannerDetail } from '@opos/contract'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GlobalDbService } from '../src/common/database/global-db.service'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addEdition,
  addEditionAccess,
  addOrder,
  addOrg,
  addScanner,
  aQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  setColumn,
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

afterEach(() => {
  vi.restoreAllMocks()
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

  // A scanner opens nothing while the org who enabled it cannot write the tickets of its
  // edition: the list says so of each, and tells an org who may come back from one who left.
  it('are told with how the org who enabled each stands', async () => {
    const c = await convention()
    const [writer, reader, expired] = [await member(), await member(), await member()]
    const writerId = await addOrg(c.t.id, writer)
    await addEditionAccess(c.t.id, writerId, c.edition, { tickets: 'write' })
    const readerId = await addOrg(c.t.id, reader)
    await addEditionAccess(c.t.id, readerId, c.edition, { tickets: 'read' })
    const expiredId = await addOrg(c.t.id, expired, { expiresAt: new Date(Date.now() - DAY) })
    await addEditionAccess(c.t.id, expiredId, c.edition, { tickets: 'write' })
    await addScanner(c.t.id, c.edition, { name: 'A of the head' })
    await addScanner(c.t.id, c.edition, { name: 'B of a writer', membershipId: writerId })
    const lowered = await addScanner(c.t.id, c.edition, {
      name: 'C of a reader',
      membershipId: readerId,
    })
    await addScanner(c.t.id, c.edition, { name: 'D of an expired', membershipId: expiredId })
    await addScanner(c.t.id, c.edition, { name: 'E of nobody', membershipId: null })

    const res = await c.head('get').expect(200)

    expect(list(res).map((scanner) => [scanner.name, scanner.orgStanding])).toEqual([
      ['A of the head', 'writes'],
      ['B of a writer', 'writes'],
      ['C of a reader', 'stopped'],
      ['D of an expired', 'stopped'],
      ['E of nobody', 'left'],
    ])
    // The scanner's own page tells the same, to an org who reads the tickets alone too.
    const page = await c.as(reader, 'get', `/${lowered.id}`).expect(200)
    expect(page.body).toMatchObject({ orgStanding: 'stopped', enabledBy: reader.email })
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

  // The answer is the scanner as its list shows it to the same org: an org who reads no team is
  // told no address of another's scanner, revoked now or long ago.
  it('tells who enabled it only to an org who may read the team', async () => {
    const c = await convention()
    const org = await member()
    await addEditionAccess(c.t.id, await addOrg(c.t.id, org), c.edition, { tickets: 'write' })
    const scanner = await addScanner(c.t.id, c.edition, { name: 'Gate of the head' })
    const own = enabled(await c.as(org, 'post', '', { name: 'Gate of the org' }).expect(201))

    const res = await c.as(org, 'delete', `/${scanner.id}`).expect(200)

    expect((res.body as Scanner).enabledBy).toBeNull()
    const again = await c.as(org, 'delete', `/${scanner.id}`).expect(200)
    expect((again.body as Scanner).enabledBy).toBeNull()
    const asHead = await c.head('delete', `/${scanner.id}`).expect(200)
    expect((asHead.body as Scanner).enabledBy).toBe(c.t.head.email)
    const ofOwn = await c.as(org, 'delete', `/${own.id}`).expect(200)
    expect((ofOwn.body as Scanner).enabledBy).toBe(org.email)
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

// D15: each scanner has a page of its own, with what it handed out.
describe('the page of a scanner', () => {
  const detail = (res: { body: unknown }) => res.body as ScannerDetail

  /** A paid order of add-ons, with the lines given marked as handed out by the scanner at a time. */
  async function handedOut(
    c: Awaited<ReturnType<typeof convention>>,
    holderName: string,
    marks: { by: string | null; at: string }[],
  ) {
    const addOnIds = []
    for (const [index] of marks.entries()) {
      addOnIds.push(await addAddOn(c.t.id, c.edition, { name: `${holderName} ${index}` }))
    }
    const order = await addOrder(c.t.id, c.edition, {
      status: 'paid',
      holderName,
      ageBand: null,
      addOnIds,
    })
    const lines = (await storedRows('order_lines', c.t.id)).filter(
      (line) => line.order_id === order.id,
    )
    for (const [index, mark] of marks.entries()) {
      const line = String(lines[index]!.id)
      await setColumn('order_lines', line, 'handed_out_at', mark.at)
      if (mark.by) await setColumn('order_lines', line, 'handed_out_by', mark.by)
    }
    return order
  }

  it('tells the scanner and the orders it handed something out of, the one marked last first', async () => {
    const c = await convention()
    const gate = await addScanner(c.t.id, c.edition, { name: 'Main gate' })
    const desk = await addScanner(c.t.id, c.edition, { name: 'Desk' })
    const ada = await handedOut(c, 'Ada', [
      { by: gate.id, at: '2027-06-01T08:00:00Z' },
      { by: gate.id, at: '2027-06-01T08:05:00Z' },
      // A line the desk marked, and one an org marked in the panel, are not the gate's.
      { by: desk.id, at: '2027-06-01T09:00:00Z' },
      { by: null, at: '2027-06-01T09:30:00Z' },
    ])
    const grace = await handedOut(c, 'Grace', [{ by: gate.id, at: '2027-06-02T10:00:00Z' }])
    await handedOut(c, 'Nobody at the gate', [{ by: desk.id, at: '2027-06-02T11:00:00Z' }])

    const res = await c.head('get', `/${gate.id}`).expect(200)

    expect(detail(res)).toMatchObject({
      id: gate.id,
      name: 'Main gate',
      enabledBy: c.t.head.email,
      paired: true,
      revokedAt: null,
    })
    expect(detail(res).handOuts).toEqual({
      orders: 2,
      lines: 3,
      firstAt: '2027-06-01T08:00:00.000Z',
      lastAt: '2027-06-02T10:00:00.000Z',
      latest: [
        {
          orderId: grace.id,
          number: grace.number,
          holderName: 'Grace',
          lines: 1,
          lastAt: '2027-06-02T10:00:00.000Z',
        },
        {
          orderId: ada.id,
          number: ada.number,
          holderName: 'Ada',
          lines: 2,
          lastAt: '2027-06-01T08:05:00.000Z',
        },
      ],
    })
    expect(JSON.stringify(res.body)).not.toMatch(/pairing|token|hash|email"/i)
  })

  it('holds nothing handed out for a scanner that marked nothing', async () => {
    const c = await convention()
    const gate = await addScanner(c.t.id, c.edition)

    const res = await c.head('get', `/${gate.id}`).expect(200)

    expect(detail(res).handOuts).toEqual({
      orders: 0,
      lines: 0,
      firstAt: null,
      lastAt: null,
      latest: [],
    })
  })

  it('is read with tickets read access, and tells who enabled the scanner as the list does', async () => {
    const c = await convention()
    const gate = await addScanner(c.t.id, c.edition)
    const [reader, stranger] = [await member(), await member()]
    await addEditionAccess(c.t.id, await addOrg(c.t.id, reader), c.edition, { tickets: 'read' })
    await addEditionAccess(c.t.id, await addOrg(c.t.id, stranger), c.edition, { program: 'write' })

    const res = await c.as(reader, 'get', `/${gate.id}`).expect(200)

    // The address of another org is behind the settings permission.
    expect(detail(res).enabledBy).toBeNull()
    await c.as(stranger, 'get', `/${gate.id}`).expect(403)
  })

  it('knows the scanners of its own edition alone', async () => {
    const c = await convention()
    const other = await convention()
    const elsewhere = await addScanner(c.t.id, await addEdition(c.t.id))
    const foreign = await addScanner(other.t.id, other.edition)

    for (const id of [elsewhere.id, foreign.id, 'no-identifier']) {
      await c.head('get', `/${id}`).expect(404)
    }
  })
})

// D14: a scanner is paired again with a new code, which takes it from the phone that held it.
describe('a new pairing code', () => {
  const scan = (token: string) =>
    request(app.getHttpServer())
      .post('/scanner/scans')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: aQrCode() })
  const pair = (code: string) => request(app.getHttpServer()).post('/scanner/pair').send({ code })

  it('is answered once, and takes the scanner from the phone that held it', async () => {
    const c = await convention()
    const first = enabled(await c.head('post', '', { name: 'Main gate' }).expect(201))
    const phone = (await pair(first.pairingCode).expect(200)).body as { token: string }
    // The phone is the scanner: a code nobody knows is "Not valid", not refused.
    await scan(phone.token).expect(409)
    const before = Date.now()

    const res = await c.head('post', `/${first.id}/pairing-code`).expect(200)

    const again = enabled(res)
    expect(again).toMatchObject({ id: first.id, name: 'Main gate', paired: false })
    expect(again.pairingCode).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(again.pairingCode).not.toBe(first.pairingCode)
    const minutes = (Date.parse(again.pairingExpiresAt) - before) / 60_000
    expect(minutes).toBeGreaterThan(14.9)
    expect(minutes).toBeLessThan(15.1)
    const [row] = await c.stored()
    expect(row).toMatchObject({
      pairing_code_hash: hashOf(again.pairingCode),
      paired_at: null,
      token_hash: null,
    })
    // The phone that held the scanner holds it no more, and the first code stays spent.
    expect((await scan(phone.token).expect(401)).body).toMatchObject({ code: 'scanner.revoked' })
    await pair(first.pairingCode).expect(403)
    // Another phone opens the new code and becomes the scanner.
    const next = (await pair(again.pairingCode).expect(200)).body as { token: string }
    await scan(next.token).expect(409)
    expect(list(await c.head('get').expect(200))[0]).toMatchObject({ paired: true })
  })

  it('is any org’s with tickets write access, and nobody’s without it', async () => {
    const c = await convention()
    const gate = await addScanner(c.t.id, c.edition)
    const [writer, reader] = [await member(), await member()]
    await addEditionAccess(c.t.id, await addOrg(c.t.id, writer), c.edition, { tickets: 'write' })
    await addEditionAccess(c.t.id, await addOrg(c.t.id, reader), c.edition, { tickets: 'read' })

    await c.as(reader, 'post', `/${gate.id}/pairing-code`).expect(403)
    await c.as(writer, 'post', `/${gate.id}/pairing-code`).expect(200)
  })

  it('is refused for a scanner that was revoked and for one that has ended', async () => {
    const c = await convention()
    const revoked = await addScanner(c.t.id, c.edition, { revoked: true })
    const ended = await addScanner(c.t.id, c.edition, {
      expiresAt: new Date(Date.now() - DAY).toISOString(),
    })
    const before = await c.stored()

    for (const scanner of [revoked, ended]) {
      const res = await c.head('post', `/${scanner.id}/pairing-code`).expect(409)
      expect(res.body).toMatchObject({ code: 'scanner.ended' })
    }
    expect(await c.stored()).toEqual(before)
  })

  // The phone a new code pairs holds the scanner until the scanner ends: an org hands no
  // scanner on past the end of its own access (D3).
  it('is refused to an org whose own access ends before the scanner does', async () => {
    const c = await convention()
    const gate = await addScanner(c.t.id, c.edition, {
      expiresAt: new Date(Date.now() + 60 * DAY).toISOString(),
    })
    const [leaving, staying] = [await member(), await member()]
    const soon = await addOrg(c.t.id, leaving, { expiresAt: new Date(Date.now() + 30 * DAY) })
    const later = await addOrg(c.t.id, staying, { expiresAt: new Date(Date.now() + 90 * DAY) })
    for (const org of [soon, later]) {
      await addEditionAccess(c.t.id, org, c.edition, { tickets: 'write' })
    }
    const before = await c.stored()

    const refused = await c.as(leaving, 'post', `/${gate.id}/pairing-code`).expect(422)

    expect(refused.body).toMatchObject({ code: 'scanner.outlives-org' })
    // The phone that holds the scanner keeps it.
    expect(await c.stored()).toEqual(before)
    await c.as(staying, 'post', `/${gate.id}/pairing-code`).expect(200)
  })

  // A scanner answers to the org who enabled it: once that org's access has ended it opens
  // nothing, so a code for it would pair no phone.
  it('is refused for a scanner whose org has left the team or lost its access', async () => {
    const c = await convention()
    const gone = await addOrg(c.t.id, await member(), { expired: true })
    const expired = await addScanner(c.t.id, c.edition, { membershipId: gone })
    const orphan = await addScanner(c.t.id, c.edition, { membershipId: null })
    const before = await c.stored()

    for (const scanner of [expired, orphan]) {
      const res = await c.head('post', `/${scanner.id}/pairing-code`).expect(409)
      expect(res.body).toMatchObject({ code: 'scanner.ended' })
    }
    expect(await c.stored()).toEqual(before)
  })

  // A code and a token are found across tenants by their hash, a moment before the scanner is
  // judged in its tenant: what is judged there is the secret the phone sent, not the row the
  // hash once named.
  it('pairs no phone by the code it replaced, also when that code was found a moment before', async () => {
    const c = await convention()
    const first = enabled(await c.head('post', '', { name: 'Main gate' }).expect(201))
    const again = enabled(await c.head('post', `/${first.id}/pairing-code`).expect(200))
    vi.spyOn(app.get(GlobalDbService), 'scannerByPairingCode').mockResolvedValueOnce({
      id: first.id,
      tenantId: c.t.id,
    })

    const refused = await pair(first.pairingCode).expect(403)

    expect(refused.body).toMatchObject({ code: 'scanner.code-refused' })
    expect((await c.stored())[0]).toMatchObject({ paired_at: null, token_hash: null })
    // The new code is still the one that pairs a phone.
    await pair(again.pairingCode).expect(200)
  })

  it('knows no phone by the token it took back, also when that token was found a moment before', async () => {
    const c = await convention()
    const first = enabled(await c.head('post', '', { name: 'Main gate' }).expect(201))
    const phone = (await pair(first.pairingCode).expect(200)).body as { token: string }
    const again = enabled(await c.head('post', `/${first.id}/pairing-code`).expect(200))
    const next = (await pair(again.pairingCode).expect(200)).body as { token: string }
    vi.spyOn(app.get(GlobalDbService), 'scannerByToken').mockResolvedValueOnce({
      id: first.id,
      tenantId: c.t.id,
    })

    const refused = await scan(phone.token).expect(401)

    expect(refused.body).toMatchObject({ code: 'scanner.revoked' })
    await scan(next.token).expect(409)
  })

  it('knows the scanners of its own edition alone', async () => {
    const c = await convention()
    const other = await convention()
    const elsewhere = await addScanner(c.t.id, await addEdition(c.t.id))
    const foreign = await addScanner(other.t.id, other.edition)

    for (const id of [elsewhere.id, foreign.id, 'no-identifier']) {
      await c.head('post', `/${id}/pairing-code`).expect(404)
    }
    expect((await other.stored())[0]!.paired_at).not.toBeNull()
  })
})
