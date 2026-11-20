import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TenantContextService } from '../src/common/als/tenant-context.service'
import { AccessRepository } from '../src/common/permissions/access.repository'
import { LogoRepository } from '../src/modules/branding/logo.repository'
import { MerchandiseRepository } from '../src/modules/catalog/merchandise.repository'
import { DiscountsRepository } from '../src/modules/checkout/discounts.repository'
import { MyOrdersRepository } from '../src/modules/buyer-orders/my-orders.repository'
import { OrderLinksRepository } from '../src/modules/buyer-orders/order-links.repository'
import { OfferRepository } from '../src/modules/checkout/offer.repository'
import { OrdersRepository } from '../src/modules/checkout/orders.repository'
import { PaymentsRepository } from '../src/modules/checkout/payments.repository'
import { ScannersRepository } from '../src/modules/scanner/scanners.repository'
import { ScansRepository } from '../src/modules/scanner/scans.repository'
import { DocumentsRepository } from '../src/modules/shop/documents.repository'
import { InvitationsRepository } from '../src/modules/tenants/invitations.repository'
import { deleteCreatedAccounts } from './auth'
import { createHash, randomUUID } from 'node:crypto'
import {
  addDocument,
  addEdition,
  addEditionAccess,
  addLogo,
  addMerchandiseItem,
  addOrder,
  addOrderLinkWithToken,
  addOrg,
  addQrCode,
  addScanner,
  addTicketType,
  aQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  queueOrderEmail,
  setCatalogSettings,
  setColumn,
  setPublished,
  storedMembership,
  tenantWithHead,
  withoutRls,
} from './tenants'

// The reads that decide which tenant a request acts in filter on the tenant of the transaction
// themselves, besides RLS: these run them on a connection that bypasses RLS.

/** A TenantContextService whose transaction is `tx`, as the repositories read it. */
const contextOf = (tx: unknown) => ({ tx: () => tx }) as unknown as TenantContextService

let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let orgOfB: Member
let orgOfBMembership: string
let editionOfB: string
const jtiOfB = randomUUID()

beforeAll(async () => {
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  orgOfB = await member()
  orgOfBMembership = await addOrg(b.id, orgOfB, { settings: 'write' })
  editionOfB = await addEdition(b.id)
  await addEditionAccess(b.id, orgOfBMembership, editionOfB, { program: 'read' })
  await withoutRls(b.id, (tx) =>
    new InvitationsRepository(contextOf(tx)).recordAcceptance(b.id, jtiOfB),
  )
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
})

describe('activeMembership', () => {
  it("finds no membership of another tenant in this tenant's transaction", async () => {
    const found = await withoutRls(a.id, (tx) =>
      new AccessRepository(contextOf(tx)).activeMembership(orgOfB.id),
    )
    expect(found).toBeNull()
  })

  it('finds the membership of the tenant in context', async () => {
    const found = await withoutRls(b.id, (tx) =>
      new AccessRepository(contextOf(tx)).activeMembership(orgOfB.id),
    )
    expect(found).toMatchObject({ role: 'org', settingsAccess: 'write' })
  })
})

// The logo a tenant's address names decides which file anyone may read.
describe("a convention's logo", () => {
  it("finds no logo of another tenant in this tenant's transaction", async () => {
    const logo = await addLogo(b.id)

    expect(await withoutRls(a.id, (tx) => new LogoRepository(contextOf(tx)).find(a.id))).toBeNull()
    expect(await withoutRls(a.id, (tx) => new LogoRepository(contextOf(tx)).find(b.id))).toEqual(
      logo,
    )
  })
})

// The version a tenant's address names decides which file anyone may download.
describe('the file of a published version', () => {
  it("finds no version of another tenant in this tenant's transaction", async () => {
    const document = await addDocument(b.id, editionOfB, 'shop-terms')
    const [versionId] = document.versionIds
    const find = (tenantId: string) =>
      withoutRls(a.id, (tx) =>
        new DocumentsRepository(contextOf(tx)).versionFile(tenantId, versionId!),
      )

    expect(await find(a.id)).toBeUndefined()
    expect(await find(b.id)).toEqual({ fileId: document.fileIds[0], editionId: editionOfB })
  })
})

describe('a file of merchandise that is for everyone', () => {
  it("finds no picture and no size chart of another tenant in this tenant's transaction", async () => {
    await setPublished(editionOfB, true)
    const item = await addMerchandiseItem(b.id, editionOfB, { sized: true, pictures: 1 })
    const find = (tenantId: string, fileId: string) =>
      withoutRls(a.id, (tx) => new MerchandiseRepository(contextOf(tx)).shownFile(tenantId, fileId))

    for (const [fileId, kind] of [
      [item.pictureFileIds[0]!, 'merchandise-picture'],
      [item.chartFileId!, 'merchandise-size-chart'],
    ] as const) {
      expect(await find(a.id, fileId)).toBeUndefined()
      expect(await find(b.id, fileId)).toEqual({ kind, fileId, editionId: editionOfB })
    }
  })
})

// A scanner's requests name no tenant: its token does, by a lookup across tenants. What the
// device may then do, and what it reads, is found in that tenant alone
// (docs/specs/0007-scanner.md, Tenant isolation and permissions).
describe('what a scanner opens', () => {
  it("finds no scanner of another tenant in this tenant's transaction", async () => {
    const scanner = await addScanner(b.id, editionOfB)
    const find = (tenantId: string) =>
      withoutRls(a.id, (tx) =>
        new ScannersRepository(contextOf(tx)).standing(tenantId, scanner.id, new Date()),
      )

    expect(await find(a.id)).toBeUndefined()
    expect(await find(b.id)).toMatchObject({ id: scanner.id, tenantId: b.id })
  })

  it("reads no QR code, no order and no line of another tenant in this tenant's transaction", async () => {
    const order = await addOrder(b.id, editionOfB, { status: 'paid' })
    const code = aQrCode()
    const codeId = await addQrCode(b.id, editionOfB, order.id, code)
    const scanned = { ...order, status: 'paid' as const, holderName: 'Ada', ageBand: null }
    const hash = createHash('sha256').update(code).digest('hex')
    const read = (tenantId: string) =>
      withoutRls(a.id, async (tx) => {
        const scans = new ScansRepository(contextOf(tx))
        return {
          code: await scans.code(tenantId, hash),
          orders: await scans.orders(tenantId, editionOfB, codeId),
          marked: await scans.handOut(tenantId, order.id, [randomUUID()], randomUUID(), new Date()),
        }
      })

    expect(await read(a.id)).toEqual({ code: undefined, orders: [], marked: [] })
    expect(await read(b.id)).toMatchObject({
      code: { id: codeId, editionId: editionOfB },
      orders: [{ id: order.id }],
    })
    expect(scanned.id).toBe(order.id)
  })
})

// What an order link opens (docs/specs/0009-buyer-self-service.md): its routes name no tenant,
// so every read of the link and its order names the tenant the link's hash answered.
describe('an order link', () => {
  it("reads no link, order, line or QR code of another tenant in this tenant's transaction", async () => {
    await setPublished(editionOfB, true)
    const ticketTypeId = await addTicketType(b.id, editionOfB)
    const order = await addOrder(b.id, editionOfB, { status: 'paid', ticketTypeId })
    await addQrCode(b.id, editionOfB, order.id, aQrCode())
    const token = await addOrderLinkWithToken(b.id, editionOfB, order.id)
    const hash = createHash('sha256').update(token).digest('hex')
    await queueOrderEmail(b.id, editionOfB, order.id, 'order-link', 'buyer@example.test')
    await setCatalogSettings(b.id, editionOfB, { pickupInformation: 'At the desk.' })
    const read = (tenantId: string) =>
      withoutRls(a.id, async (tx) => {
        const links = new OrderLinksRepository(contextOf(tx))
        return {
          link: await links.byHash(tenantId, hash),
          order: await links.order(tenantId, order.id),
          lines: await links.lines(tenantId, order.id),
          qrCode: await links.qrCode(tenantId, order.id),
          pickUp: await links.pickupInformation(tenantId, editionOfB),
          queued: await links.linkQueuedSince(tenantId, order.id, new Date(0)),
        }
      })

    expect(await read(a.id)).toEqual({
      link: undefined,
      order: undefined,
      lines: [],
      qrCode: undefined,
      pickUp: null,
      queued: false,
    })
    expect(await read(b.id)).toMatchObject({
      link: { orderId: order.id },
      order: { id: order.id, tenantId: b.id },
      lines: [{ kind: 'ticket' }],
      qrCode: { code: 'sealed' },
      pickUp: 'At the desk.',
      queued: true,
    })
  })
})

// The routes of an account's own orders have no permission to check: their reads are the guard
// (docs/specs/0009-buyer-self-service.md, U4).
describe("an account's own orders", () => {
  it("lists and finds no order of another tenant in this tenant's transaction", async () => {
    await setPublished(editionOfB, true)
    const ticketTypeId = await addTicketType(b.id, editionOfB)
    const order = await addOrder(b.id, editionOfB, { status: 'paid', ticketTypeId })
    await addQrCode(b.id, editionOfB, order.id, aQrCode())
    const more = await addOrder(b.id, editionOfB, { status: 'paid' })
    await setColumn('orders', more.id, 'extends_order_id', order.id)
    const buyer = await member()
    const of = { tenantId: b.id, editionId: editionOfB }
    await withoutRls(b.id, async (tx) => {
      const orders = new OrdersRepository(contextOf(tx))
      await orders.attach({ ...of, orderId: order.id }, buyer.id)
      await orders.attach({ ...of, orderId: more.id }, buyer.id)
    })
    const read = (tenantId: string) =>
      withoutRls(a.id, async (tx) => {
        const orders = new OrdersRepository(contextOf(tx))
        return {
          listed: (await new MyOrdersRepository(contextOf(tx)).list(tenantId, buyer.id)).length,
          own: await orders.own(tenantId, buyer.id, order.id),
          bought: await orders.boughtWith(tenantId, order.id),
          code: await orders.codeToJoin({ tenantId, orderId: more.id }),
        }
      })

    expect(await read(a.id)).toEqual({
      listed: 0,
      own: undefined,
      bought: { ticketTypeId: null, addOnIds: [], itemIds: [] },
      code: undefined,
    })
    expect(await read(b.id)).toMatchObject({
      listed: 2,
      own: { id: order.id, status: 'paid' },
      bought: { ticketTypeId },
      code: expect.any(String) as string,
    })
  })
})

// The reads that decide which order a buyer opens, and in which edition an account buys.
describe('an order a buyer opens', () => {
  const payments = (tx: unknown) =>
    new PaymentsRepository(
      contextOf(tx),
      new OfferRepository(contextOf(tx)),
      new DiscountsRepository(contextOf(tx)),
    )

  it("finds no order of another tenant in this tenant's transaction", async () => {
    await setPublished(editionOfB, true)
    const order = await addOrder(b.id, editionOfB)
    const find = (tenantId: string) =>
      withoutRls(a.id, (tx) => payments(tx).order(tenantId, order.id))

    expect(await find(a.id)).toBeUndefined()
    expect(await find(b.id)).toMatchObject({ id: order.id, tenantId: b.id })
  })

  it("finds no account of another tenant's order in this tenant's transaction", async () => {
    const order = await addOrder(b.id, editionOfB)
    await withoutRls(b.id, (tx) =>
      new OrdersRepository(contextOf(tx)).attach(
        { tenantId: b.id, editionId: editionOfB, orderId: order.id },
        orgOfB.id,
      ),
    )
    const isOf = (tenantId: string) =>
      withoutRls(a.id, (tx) => payments(tx).isOf(tenantId, order.id, orgOfB.id))

    expect(await isOf(a.id)).toBe(false)
    expect(await isOf(b.id)).toBe(true)
  })

  it("finds no published edition of another tenant in this tenant's transaction", async () => {
    await setPublished(editionOfB, true)
    const find = (tenantId: string) =>
      withoutRls(a.id, (tx) =>
        new OrdersRepository(contextOf(tx)).publishedEdition(tenantId, editionOfB),
      )

    expect(await find(a.id)).toBeUndefined()
    expect(await find(b.id)).toEqual({ id: editionOfB })
  })
})

describe('editionAccess', () => {
  it("finds no edition of another tenant in this tenant's transaction", async () => {
    const headOfA = (await storedMembership(a.id, a.head.id))!.id
    const found = await withoutRls(a.id, (tx) =>
      new AccessRepository(contextOf(tx)).editionAccess(headOfA, editionOfB),
    )
    expect(found).toBeUndefined()
  })
})

describe('editionRows', () => {
  it("lists no edition row of another tenant's membership", async () => {
    const rows = await withoutRls(a.id, (tx) =>
      new AccessRepository(contextOf(tx)).editionRows(orgOfBMembership),
    )
    expect([...rows.keys()]).toEqual([])
  })
})

describe('the reads of an invitation', () => {
  const invitations = (tx: unknown) => new InvitationsRepository(contextOf(tx))

  it("finds no member of another tenant in this tenant's transaction", async () => {
    expect(await withoutRls(a.id, (tx) => invitations(tx).isMember(orgOfB.id))).toBe(false)
  })

  it('finds none of the editions of another tenant', async () => {
    const found = await withoutRls(a.id, (tx) => invitations(tx).existingEditions([editionOfB]))
    expect([...found]).toEqual([])
  })

  it('finds no invitation another tenant accepted', async () => {
    expect(await withoutRls(a.id, (tx) => invitations(tx).isAccepted(jtiOfB))).toBe(false)
  })
})

describe('the tenant of an invitation', () => {
  it.each(['a', 'b'] as const)('is the tenant of the transaction, %s', async (which) => {
    const tenant = which === 'a' ? a : b
    const found = await withoutRls(tenant.id, (tx) =>
      new InvitationsRepository(contextOf(tx)).tenant(),
    )
    expect(found?.id).toBe(tenant.id)
  })
})
