import { type NestExpressApplication } from '@nestjs/platform-express'
import { type PairedScanner, type ScanResult } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addEdition,
  addEditionAccess,
  addMerchandiseItem,
  addOrder,
  addOrg,
  addQrCode,
  addScanner,
  addTicketType,
  aQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  openTransaction,
  removeMembership,
  setColumn,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// What a phone asks as a scanner (docs/specs/0007-scanner.md): it spends a pairing code, and
// from then on reads QR codes and marks hand-outs under its token, with no account and no place
// in the team. It reads the orders of its own edition alone, and only those it scanned.

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
const post = (path: string, token: string | null, body: object) => {
  const req = request(app.getHttpServer()).post(path)
  return (token === null ? req : req.set('Authorization', `Bearer ${token}`)).send(body)
}
const scan = (token: string | null, code: string) => post('/scanner/scans', token, { code })
const handOut = (token: string, code: string, orderId: string, lineIds: string[]) =>
  post('/scanner/hand-outs', token, { code, orderId, lineIds })
const pair = (code: string) => post('/scanner/pair', null, { code })
const result = (res: { body: unknown }) => res.body as ScanResult
const revoked = { code: 'scanner.revoked' }
const notValid = (reason: string) => ({ code: 'scan.not-valid', params: { reason } })

/** A tenant of its own with an edition, a ticket type with perks and a paired scanner. */
async function gate() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id, { name: 'Edition of the gate' })
  const standard = await addTicketType(t.id, edition, {
    name: 'Standard',
    perks: ['Badge', 'Lanyard'],
  })
  const scanner = await addScanner(t.id, edition, { name: 'Main gate' })
  /** A paid order with a ticket and the QR code it carries. */
  const paid = async (values: Parameters<typeof addOrder>[2] = {}) => {
    const order = await addOrder(t.id, edition, {
      status: 'paid',
      ticketTypeId: standard,
      ...values,
    })
    const code = aQrCode()
    await addQrCode(t.id, edition, order.id, code)
    return { ...order, code }
  }
  const lines = async (orderId: string) =>
    (await storedRows('order_lines', t.id)).filter((row) => row.order_id === orderId)
  return { t, edition, standard, scanner, token: scanner.token, paid, lines }
}

describe('pairing a phone', () => {
  it('spends the code an org was shown, and answers the token once', async () => {
    const g = await gate()
    const enabled = await request(app.getHttpServer())
      .post(`/editions/${g.edition}/scanners`)
      .use(session(g.t.head.token))
      .set('X-Tenant-Slug', g.t.slug)
      .send({ name: 'Desk' })
      .expect(201)
    const { pairingCode, expiresAt } = enabled.body as { pairingCode: string; expiresAt: string }

    const res = await pair(pairingCode).expect(200)

    const paired = res.body as PairedScanner
    expect(paired).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      name: 'Desk',
      editionName: 'Edition of the gate',
      conventionName: `Tenant ${g.t.slug}`,
      // What the phone shows a moment in: the convention's time zone, never its own.
      timezone: 'Europe/Warsaw',
      expiresAt,
    })
    // The phone is a scanner from now on, and the code is spent.
    const order = await g.paid()
    await scan(paired.token, order.code).expect(200)
    const again = await pair(pairingCode).expect(403)
    expect(again.body).toMatchObject({ code: 'scanner.code-refused' })
    // Of the token only the hash is kept.
    expect(JSON.stringify(await storedRows('scanner_devices', g.t.id))).not.toContain(paired.token)
  })

  it('refuses a code that is unknown, expired or of a revoked scanner', async () => {
    const g = await gate()
    const [expired, ofRevoked] = ['expired-code-'.padEnd(43, 'x'), 'revoked-code-'.padEnd(43, 'x')]
    await addScanner(g.t.id, g.edition, {
      pairingCode: expired,
      pairingExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await addScanner(g.t.id, g.edition, { pairingCode: ofRevoked, revoked: true })

    for (const code of ['nobody-knows-this-code', expired, ofRevoked]) {
      const res = await pair(code).expect(403)
      expect(res.body).toMatchObject({ code: 'scanner.code-refused' })
    }
    await pair('').expect(400)
    expect(
      (await storedRows('scanner_devices', g.t.id)).filter((row) => row.token_hash),
    ).toHaveLength(1)
  })
})

describe('a scanner', () => {
  it('is refused with no token, an unknown one, and an account’s session', async () => {
    const g = await gate()
    const order = await g.paid()

    for (const token of [null, 'x'.repeat(43), g.t.head.token]) {
      const res = await scan(token, order.code).expect(401)
      expect(res.body).toMatchObject(revoked)
    }
  })

  // A device's access ends no later than that of the org who enabled it: their tickets write
  // access to the scanner's edition, not their place in the team alone.
  it('reads nothing once its org has no tickets write access to its edition, whoever paired it since', async () => {
    const g = await gate()
    const order = await g.paid()
    const org = await member()
    const orgId = await addOrg(g.t.id, org)
    await addEditionAccess(g.t.id, orgId, g.edition, { tickets: 'write' })
    const ofOrg = await addScanner(g.t.id, g.edition, { membershipId: orgId })
    await scan(ofOrg.token, order.code).expect(200)
    const [access] = (await storedRows('edition_memberships', g.t.id)).filter(
      (row) => row.tenant_membership_id === orgId,
    )

    // Lowered to read: the org stays in the team, and the scanner stops.
    await setColumn('edition_memberships', String(access!.id), 'tickets_access', 'read')
    expect((await scan(ofOrg.token, order.code).expect(401)).body).toMatchObject(revoked)
    await setColumn('edition_memberships', String(access!.id), 'tickets_access', 'write')
    await scan(ofOrg.token, order.code).expect(200)

    // The head pairs the phone again: the scanner stays the org's, and stops with their access.
    const renewed = await request(app.getHttpServer())
      .post(`/editions/${g.edition}/scanners/${ofOrg.id}/pairing-code`)
      .use(session(g.t.head.token))
      .set('X-Tenant-Slug', g.t.slug)
      .expect(200)
    const paired = (await pair((renewed.body as { pairingCode: string }).pairingCode).expect(200))
      .body as PairedScanner
    await scan(paired.token, order.code).expect(200)
    // Access to the edition removed while the org stays in the team.
    const removing = await openTransaction()
    await removing.sql`delete from edition_memberships where id = ${String(access!.id)}`
    await removing.commit()
    expect((await scan(paired.token, order.code).expect(401)).body).toMatchObject(revoked)
    // A head's scanner holds every edition's access by the role itself.
    await scan(g.token, order.code).expect(200)
  })

  it('reads nothing once it is revoked, once it has ended, and once its org has', async () => {
    const g = await gate()
    const order = await g.paid()
    const org = await member()
    const orgId = await addOrg(g.t.id, org)
    await addEditionAccess(g.t.id, orgId, g.edition, { tickets: 'write' })
    const ofOrg = await addScanner(g.t.id, g.edition, { membershipId: orgId })
    const ended = await addScanner(g.t.id, g.edition, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    const gone = await addScanner(g.t.id, g.edition, { revoked: true })
    await scan(ofOrg.token, order.code).expect(200)

    for (const token of [ended.token, gone.token]) {
      expect((await scan(token, order.code).expect(401)).body).toMatchObject(revoked)
    }
    // The org's access ends: so does the scanner's.
    await setColumn(
      'tenant_memberships',
      orgId,
      'expires_at',
      new Date(Date.now() - DAY).toISOString(),
    )
    expect((await scan(ofOrg.token, order.code).expect(401)).body).toMatchObject(revoked)
    await setColumn('tenant_memberships', orgId, 'expires_at', null)
    await scan(ofOrg.token, order.code).expect(200)
    // The org leaves the team.
    await removeMembership(orgId)
    expect((await scan(ofOrg.token, order.code).expect(401)).body).toMatchObject(revoked)
    expect(
      (
        await handOut(ofOrg.token, order.code, order.id, [
          String((await g.lines(order.id))[0]!.id),
        ]).expect(401)
      ).body,
    ).toMatchObject(revoked)
  })

  it('reads nothing of a suspended convention', async () => {
    const g = await gate()
    const order = await g.paid()
    await suspend(g.t.id)

    const res = await scan(g.token, order.code)

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'tenant.suspended' })
  })

  it('records when it was last used', async () => {
    const g = await gate()
    const order = await g.paid()
    const before = Date.now()

    await scan(g.token, order.code).expect(200)

    const [row] = (await storedRows('scanner_devices', g.t.id)).filter(
      (device) => device.id === g.scanner.id,
    )
    expect(new Date(String(row!.last_used_at)).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })
})

describe('a scan', () => {
  it('shows the ticket holder, the ticket type with its perks, the add-ons and the merchandise', async () => {
    const g = await gate()
    const room = await addAddOn(g.t.id, g.edition, { name: 'Room' })
    const shirt = await addMerchandiseItem(g.t.id, g.edition, { name: 'T-shirt', sized: true })
    const order = await g.paid({
      holderName: 'Ada Lovelace',
      addOnIds: [room],
      variants: [{ itemId: shirt.id, variantId: shirt.variantId, quantity: 2 }],
    })

    const res = await scan(g.token, order.code).expect(200)

    expect(result(res)).toEqual({
      orders: [
        {
          orderId: order.id,
          number: order.number,
          holderName: 'Ada Lovelace',
          ageBand: 'adult',
          entry: {
            lineId: expect.any(String) as string,
            ticketType: 'Standard',
            perks: ['Badge', 'Lanyard'],
            handedOutAt: null,
            handedOutBy: null,
          },
          addOns: [
            {
              lineId: expect.any(String) as string,
              name: 'Room',
              handedOutAt: null,
              handedOutBy: null,
            },
          ],
          items: [
            {
              lineId: expect.any(String) as string,
              name: 'T-shirt',
              variant: [expect.any(String) as string],
              quantity: 2,
              handedOutAt: null,
              handedOutBy: null,
            },
          ],
        },
      ],
    })
    // No email address reaches a scanner.
    expect(JSON.stringify(res.body)).not.toMatch(/@|email/)
  })

  it.each(['child', 'teen'] as const)('says the ticket holder is a %s', async (ageBand) => {
    const g = await gate()
    const order = await g.paid({ ageBand })

    expect(result(await scan(g.token, order.code).expect(200)).orders[0]!.ageBand).toBe(ageBand)
  })

  it('shows no entry for an order of merchandise alone: its items', async () => {
    const g = await gate()
    const pin = await addMerchandiseItem(g.t.id, g.edition, { name: 'Pin' })
    const order = await addOrder(g.t.id, g.edition, {
      status: 'paid',
      ageBand: null,
      variants: [{ itemId: pin.id, variantId: pin.variantId, quantity: 1 }],
    })
    const code = aQrCode()
    await addQrCode(g.t.id, g.edition, order.id, code)

    const [shown] = result(await scan(g.token, code).expect(200)).orders

    expect(shown).toMatchObject({ entry: null, ageBand: null, addOns: [] })
    expect(shown!.items.map((item) => item.name)).toEqual(['Pin'])
  })

  it('shows every order on a shared code that is not canceled, and refuses it once all are', async () => {
    const g = await gate()
    const first = await g.paid({ holderName: 'Ada' })
    const second = await addOrder(g.t.id, g.edition, {
      status: 'paid',
      ticketTypeId: g.standard,
      holderName: 'Grace',
    })
    const sharing = await openTransaction()
    await sharing.sql`
      insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
      select tenant_id, edition_id, ${second.id}, qr_code_id from order_qr_code_orders
      where order_id = ${first.id}
    `
    await sharing.commit()

    const both = result(await scan(g.token, first.code).expect(200))
    expect(both.orders.map((order) => order.holderName).sort()).toEqual(['Ada', 'Grace'])

    await setColumn('orders', first.id, 'status', 'canceled')
    const one = result(await scan(g.token, first.code).expect(200))
    expect(one.orders.map((order) => order.holderName)).toEqual(['Grace'])

    await setColumn('orders', second.id, 'status', 'canceled')
    expect((await scan(g.token, first.code).expect(409)).body).toMatchObject(notValid('canceled'))
  })

  it('is "Not valid", with the reason, for a canceled order, a replaced code and one nobody knows', async () => {
    const g = await gate()
    const canceled = await g.paid()
    await setColumn('orders', canceled.id, 'status', 'canceled')
    const moved = await g.paid()
    const old = aQrCode()
    await addQrCode(g.t.id, g.edition, moved.id, old, true)

    expect((await scan(g.token, canceled.code).expect(409)).body).toMatchObject(
      notValid('canceled'),
    )
    expect((await scan(g.token, old).expect(409)).body).toMatchObject(notValid('replaced'))
    expect((await scan(g.token, aQrCode()).expect(409)).body).toMatchObject(notValid('unknown'))
    await scan(g.token, 'not a code').expect(400)
    // The code the order carries now is the one that opens it.
    await scan(g.token, moved.code).expect(200)
  })

  // A QR code of another edition is "Not valid", never another edition's order.
  it('reads nothing of another edition’s order, and knows no code of another convention', async () => {
    const g = await gate()
    const other = await gate()
    const sibling = await addEdition(g.t.id)
    const elsewhere = await addOrder(g.t.id, sibling, { status: 'paid', holderName: 'Sibling' })
    const [ofSibling, ofOther] = [aQrCode(), (await other.paid({ holderName: 'Foreign' })).code]
    await addQrCode(g.t.id, sibling, elsewhere.id, ofSibling)

    const sameConvention = await scan(g.token, ofSibling).expect(409)
    const otherConvention = await scan(g.token, ofOther).expect(409)

    expect(sameConvention.body).toMatchObject(notValid('other-edition'))
    expect(otherConvention.body).toMatchObject(notValid('unknown'))
    expect(JSON.stringify([sameConvention.body, otherConvention.body])).not.toMatch(
      /Sibling|Foreign/,
    )
  })
})

describe('a hand-out', () => {
  /** A paid order of a ticket and a pin, with its two lines by their kind. */
  async function withPin(g: Awaited<ReturnType<typeof gate>>) {
    const pin = await addMerchandiseItem(g.t.id, g.edition, { name: 'Pin' })
    const order = await g.paid({
      variants: [{ itemId: pin.id, variantId: pin.variantId, quantity: 1 }],
    })
    const lines = await g.lines(order.id)
    const of = (kind: string) => String(lines.find((line) => line.kind === kind)!.id)
    return { order, entry: of('ticket'), item: of('merchandise') }
  }

  it('marks entry, then an item, each with the time and the scanner', async () => {
    const g = await gate()
    const { order, entry, item } = await withPin(g)
    const before = Date.now()

    const first = result(await handOut(g.token, order.code, order.id, [entry]).expect(200))

    expect(first.orders[0]!.entry).toMatchObject({ handedOutBy: 'Main gate' })
    expect(Date.parse(first.orders[0]!.entry!.handedOutAt!)).toBeGreaterThanOrEqual(before - 1000)
    expect(first.orders[0]!.items[0]).toMatchObject({ handedOutAt: null, handedOutBy: null })
    const second = result(await handOut(g.token, order.code, order.id, [item]).expect(200))
    expect(second.orders[0]!.items[0]).toMatchObject({ handedOutBy: 'Main gate' })
    // A scan marks nothing by itself, and shows what was marked.
    const shown = result(await scan(g.token, order.code).expect(200))
    expect(shown).toEqual(second)
  })

  it('refuses a second marking with the time and the scanner of the first, and marks nothing with it', async () => {
    const g = await gate()
    const desk = await addScanner(g.t.id, g.edition, { name: 'Desk' })
    const { order, entry, item } = await withPin(g)
    const first = result(await handOut(g.token, order.code, order.id, [entry]).expect(200))

    const res = await handOut(desk.token, order.code, order.id, [item, entry]).expect(409)

    expect(res.body).toMatchObject({
      code: 'scan.already-handed-out',
      params: {
        lineId: entry,
        handedOutAt: first.orders[0]!.entry!.handedOutAt,
        scanner: 'Main gate',
      },
    })
    expect(result(await scan(g.token, order.code).expect(200)).orders[0]!.items[0]).toMatchObject({
      handedOutAt: null,
    })
  })

  it('is marked once by two scanners at the same moment', async () => {
    const g = await gate()
    const desk = await addScanner(g.t.id, g.edition, { name: 'Desk' })
    const { order, entry } = await withPin(g)

    const answers = await Promise.all([
      handOut(g.token, order.code, order.id, [entry]),
      handOut(desk.token, order.code, order.id, [entry]),
    ])

    expect(answers.map((res) => res.status).sort()).toEqual([200, 409])
    expect(answers.find((res) => res.status === 409)!.body).toMatchObject({
      code: 'scan.already-handed-out',
    })
  })

  it('marks nothing of an order the code does not open, nor a line of another order', async () => {
    const g = await gate()
    const mine = await withPin(g)
    const other = await withPin(g)

    await handOut(g.token, mine.order.code, other.order.id, [other.entry]).expect(404)
    await handOut(g.token, mine.order.code, mine.order.id, [other.entry]).expect(404)
    await handOut(g.token, mine.order.code, mine.order.id, []).expect(400)
    await setColumn('orders', mine.order.id, 'status', 'canceled')
    const res = await handOut(g.token, mine.order.code, mine.order.id, [mine.entry]).expect(409)
    expect(res.body).toMatchObject(notValid('canceled'))
    expect((await g.lines(other.order.id)).every((line) => line.handed_out_at === null)).toBe(true)
  })

  // A hand-out marked by mistake is taken back in the panel, not on the scanner.
  it('is taken back on the order’s page in the panel, with the scanner that marked it', async () => {
    const g = await gate()
    const { order, entry } = await withPin(g)
    await handOut(g.token, order.code, order.id, [entry]).expect(200)

    await request(app.getHttpServer())
      .delete(`/editions/${g.edition}/orders/${order.id}/lines/${entry}/hand-out`)
      .use(session(g.t.head.token))
      .set('X-Tenant-Slug', g.t.slug)
      .expect(200)

    const [line] = (await g.lines(order.id)).filter((row) => row.id === entry)
    expect(line).toMatchObject({ handed_out_at: null, handed_out_by: null })
    await handOut(g.token, order.code, order.id, [entry]).expect(200)
  })
})
