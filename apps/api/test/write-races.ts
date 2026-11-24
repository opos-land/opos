import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { session } from './auth'
import { upload } from './files'
import { pdf, png } from './pictures'
import {
  addAddOn,
  addAddOnPicture,
  addConsent,
  addCustomField,
  addDiscountCode,
  addDocument,
  addEdition,
  addEditionAccess,
  addLogo,
  addMerchandiseItem,
  addOrder,
  addOrg,
  addProgramItem,
  addScanner,
  addTicketType,
  addVariant,
  makeShopReady,
  type Member,
  member,
  type openTransaction,
  setColumn,
  sleep,
  storedRows,
  tenantWithHead,
} from './tenants'
import { tenantWriteLockKey } from '../src/common/permissions/tenant-write-lock'

// What the tests of a tenant write racing a change to its actor share (write-race-*.test.ts).
// Every API route that lowers a member's access is a write route and runs under the tenant's
// write lock. Those tests hold that lock in a transaction of their own, lower the actor's access
// in it and commit while the actor's write waits: the write must read the committed change, refuse
// with 403 and leave the tenant as it was.

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

type Sql = Awaited<ReturnType<typeof openTransaction>>['sql']

const slug = () => randomUUID().slice(0, 8)
const window = { startsAt: '2027-06-01T09:00:00Z', endsAt: '2027-06-03T18:00:00Z' }

export interface Setup {
  t: Awaited<ReturnType<typeof tenantWithHead>>
  edition: string
  org: Member
  orgId: string
  otherId: string
  newcomer: Member
  item: string
  document: string
  consent: string
  addOn: string
  customField: string
  merch: Awaited<ReturnType<typeof addMerchandiseItem>>
  ticketType: string
  /**
   * An edition of its own for the orders, which keep their edition and their catalog in
   * place: a paid order of a ticket, handed out, and of a shirt, and an order in review.
   */
  desk: {
    edition: string
    ticketType: string
    paid: string
    review: string
    ticketLine: string
    shirtLine: string
    otherVariant: string
    scanner: string
    discountCode: string
  }
}
export type Request = { method: Method; path: string; body?: object }
export const noEdition = {
  programAccess: 'none',
  websiteContentAccess: 'none',
  ticketsAccess: 'none',
}

// A request each write route accepts from the org of setup(), and that writes something.
export const writes: Record<string, (s: Setup) => Request> = {
  'tenants.update': () => ({
    method: 'patch',
    path: '/tenants/current',
    body: { name: 'Late' },
  }),
  'tenants.members.invite': (s) => ({
    method: 'post',
    path: '/tenants/current/members',
    body: { email: s.newcomer.email },
  }),
  'tenants.members.update': (s) => ({
    method: 'patch',
    path: `/tenants/current/members/${s.otherId}`,
    body: { settingsAccess: 'read' },
  }),
  'tenants.members.remove': (s) => ({
    method: 'delete',
    path: `/tenants/current/members/${s.otherId}`,
  }),
  'editions.create': () => ({
    method: 'post',
    path: '/editions',
    body: { slug: slug(), name: 'Late', ...window },
  }),
  'editions.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}`,
    body: { name: 'Late' },
  }),
  'editions.remove': (s) => ({ method: 'delete', path: `/editions/${s.edition}` }),
  'editions.activate': (s) => ({ method: 'post', path: `/editions/${s.edition}/activate` }),
  'editions.members.put': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/members/${s.otherId}`,
    body: { ...noEdition, programAccess: 'read' },
  }),
  'editions.members.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/members/${s.otherId}`,
  }),
  'program.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/program-items`,
    body: { title: 'Late', ...window },
  }),
  'program.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/program-items/${s.item}`,
    body: { title: 'Late' },
  }),
  'program.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/program-items/${s.item}`,
  }),
  'program.speakers.put': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/program-items/${s.item}/speakers`,
    body: { emails: [s.newcomer.email] },
  }),
  'branding.putLogo': () => ({
    method: 'put',
    path: '/branding/logo',
    body: { file: upload(png(40, 20), 'image/png', 'logo.png') },
  }),
  'branding.removeLogo': () => ({ method: 'delete', path: '/branding/logo' }),
  'shop.seller.put': () => ({
    method: 'put',
    path: '/shop/seller',
    body: {
      sellerName: 'Late Ltd',
      sellerAddress: '1 Main St',
      sellerRegistrationNumber: '0000000000',
      contactEmail: 'shop@late.test',
    },
  }),
  'shop.providerAccount.put': () => ({
    method: 'put',
    path: '/shop/provider-account',
    body: { provider: 'fake', credentials: { account: 'late' } },
  }),
  'shop.providerAccount.remove': () => ({ method: 'delete', path: '/shop/provider-account' }),
  'shop.edition.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/shop`,
    body: { faqUrl: 'https://late.test/faq' },
  }),
  'shop.edition.open': (s) => ({ method: 'post', path: `/editions/${s.edition}/shop/open` }),
  // On a closed shop, which it leaves as it is: an open one would refuse the writes above that
  // take away what it needs.
  'shop.edition.close': (s) => ({ method: 'post', path: `/editions/${s.edition}/shop/close` }),
  'shop.documents.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/documents`,
    body: { kind: 'other', title: 'Late' },
  }),
  'shop.documents.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/documents/${s.document}`,
    body: { title: 'Late' },
  }),
  'shop.documents.publishVersion': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/documents/${s.document}/versions`,
    body: { file: upload(pdf(), 'application/pdf', 'late.pdf') },
  }),
  'shop.documents.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/documents/${s.document}`,
  }),
  'shop.consents.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/consents`,
    body: { text: 'Late', isRequired: true },
  }),
  'shop.consents.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/consents/${s.consent}`,
    body: { text: 'Late' },
  }),
  'shop.consents.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/consents/${s.consent}`,
  }),
  'catalog.addOns.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/add-ons`,
    body: { name: 'Late', amountMinor: 0, kind: 'unlimited' },
  }),
  'catalog.addOns.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/add-ons/${s.addOn}`,
    body: { name: 'Late' },
  }),
  'catalog.addOns.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/add-ons/${s.addOn}`,
  }),
  'catalog.addOns.putPicture': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/add-ons/${s.addOn}/picture`,
    body: { file: upload(png(40, 20), 'image/png', 'late.png') },
  }),
  'catalog.addOns.removePicture': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/add-ons/${s.addOn}/picture`,
  }),
  'catalog.customFields.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/custom-fields`,
    body: { label: 'Late', isRequired: false },
  }),
  'catalog.customFields.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/custom-fields/${s.customField}`,
    body: { label: 'Late' },
  }),
  'catalog.customFields.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/custom-fields/${s.customField}`,
  }),
  'catalog.ticketTypes.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/ticket-types`,
    body: {
      name: 'Late',
      saleStartsAt: '2027-01-01T00:00:00.000Z',
      saleEndsAt: '2027-06-01T00:00:00.000Z',
      ageBands: ['adult'],
    },
  }),
  'catalog.ticketTypes.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/ticket-types/${s.ticketType}`,
    body: { name: 'Late', tiers: [] },
  }),
  'catalog.ticketTypes.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/ticket-types/${s.ticketType}`,
  }),
  'orders.createManual': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/manual`,
    body: {
      reason: 'desk',
      cart: { ticket: { ticketTypeId: s.desk.ticketType } },
      ageBand: 'adult',
    },
  }),
  'orders.updateHolder': (s) => ({
    method: 'patch',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/holder`,
    body: { holderName: 'Late' },
  }),
  'orders.changeEmail': (s) => ({
    method: 'put',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/email`,
    body: { email: 'late@example.test' },
  }),
  'orders.swapVariant': (s) => ({
    method: 'put',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/lines/${s.desk.shirtLine}/variant`,
    body: { variantId: s.desk.otherVariant },
  }),
  'orders.cancel': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/cancel`,
    body: { reason: 'Late' },
  }),
  'orders.markPaid': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/${s.desk.review}/mark-paid`,
  }),
  'orders.decline': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/${s.desk.review}/decline`,
    body: { reason: 'Late' },
  }),
  'orders.resendConfirmation': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/resend-confirmation`,
  }),
  'orders.handOut': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/hand-outs`,
    body: { lineIds: [s.desk.shirtLine] },
  }),
  'orders.takeBackHandOut': (s) => ({
    method: 'delete',
    path: `/editions/${s.desk.edition}/orders/${s.desk.paid}/lines/${s.desk.ticketLine}/hand-out`,
  }),
  'discountCodes.create': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/discount-codes`,
    body: {
      code: 'late-code',
      kind: 'percent',
      percent: 10,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2099-01-01T00:00:00.000Z',
      ticketTypeIds: [s.desk.ticketType],
    },
  }),
  'discountCodes.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.desk.edition}/discount-codes/${s.desk.discountCode}`,
    body: { usageLimit: 5 },
  }),
  'discountCodes.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.desk.edition}/discount-codes/${s.desk.discountCode}`,
  }),
  'scanners.create': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/scanners`,
    body: { name: 'Late gate' },
  }),
  'scanners.revoke': (s) => ({
    method: 'delete',
    path: `/editions/${s.desk.edition}/scanners/${s.desk.scanner}`,
  }),
  'scanners.renewPairing': (s) => ({
    method: 'post',
    path: `/editions/${s.desk.edition}/scanners/${s.desk.scanner}/pairing-code`,
  }),
  'catalog.merchandise.create': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/merchandise-items`,
    body: { name: 'Late', amountMinor: 100, perOrderLimit: 1 },
  }),
  'catalog.merchandise.update': (s) => ({
    method: 'patch',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}`,
    body: { name: 'Late' },
  }),
  'catalog.merchandise.remove': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}`,
  }),
  'catalog.merchandise.putVariants': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/variants`,
    body: { variants: [] },
  }),
  'catalog.merchandise.putStock': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/variants/${s.merch.variantId}/stock`,
    body: { stock: 77 },
  }),
  'catalog.merchandise.addPicture': (s) => ({
    method: 'post',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/pictures`,
    body: { file: upload(png(40, 20), 'image/png', 'late.png') },
  }),
  'catalog.merchandise.removePicture': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/pictures/${s.merch.pictureIds[0]}`,
  }),
  'catalog.merchandise.putSizeChart': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/option-values/${s.merch.valueId}/size-chart`,
    body: { file: upload(png(40, 20), 'image/png', 'late.png') },
  }),
  'catalog.merchandise.removeSizeChart': (s) => ({
    method: 'delete',
    path: `/editions/${s.edition}/merchandise-items/${s.merch.id}/option-values/${s.merch.valueId}/size-chart`,
  }),
}

// After the check under the write lock, a member change waits for rows and re-checks its actor
// on the row it locked, so the access of an actor may end during that wait too.
// These requests raise nothing, so anti-escalation lets an org whose access expires send them.
export const memberChanges: Record<string, (s: Setup, ends: Date) => Request> = {
  'tenants.members.invite': (s, ends) => ({
    method: 'post',
    path: '/tenants/current/members',
    body: { email: s.newcomer.email, expiresAt: ends.toISOString() },
  }),
  'tenants.members.update': (s) => ({
    method: 'patch',
    path: `/tenants/current/members/${s.otherId}`,
    body: { settingsAccess: 'none' },
  }),
  'tenants.members.remove': (s) => writes['tenants.members.remove']!(s),
  'editions.members.put': (s) => ({
    method: 'put',
    path: `/editions/${s.edition}/members/${s.otherId}`,
    body: noEdition,
  }),
  'editions.members.remove': (s) => writes['editions.members.remove']!(s),
}

/** The setup and the requests of one test file, against its API. */
export function writeRaces(app: NestExpressApplication) {
  // The accounts of every setup of the file. A tenant of its own keeps each test apart; a sign-up
  // and a sign-in in Supabase Auth would cost more than the rest of a setup together.
  let accounts: Promise<[Member, Member, Member, Member]> | undefined

  /**
   * A tenant whose org holds settings=write, branding=write, shop=write, program=write and
   * tickets=write, another org to act on, a programme item, a logo, everything opening the
   * shop asks for, a document of the edition's own, a consent, an add-on, a custom field and
   * a merchandise item with a value, its variant, its size chart and a picture, and a ticket
   * type with a price tier.
   */
  async function setup(): Promise<Setup> {
    const [head, actor, other, newcomer] = await (accounts ??= Promise.all([
      member(),
      member(),
      member(),
      member(),
    ]))
    const t = await tenantWithHead(undefined, { head })
    const edition = await addEdition(t.id)
    const orgId = await addOrg(t.id, actor, {
      settings: 'write',
      branding: 'write',
      shop: 'write',
    })
    await addEditionAccess(t.id, orgId, edition, { program: 'write', tickets: 'write' })
    const otherId = await addOrg(t.id, other)
    await addEditionAccess(t.id, otherId, edition, {})
    const item = await addProgramItem(t.id, edition)
    await addLogo(t.id)
    await makeShopReady(t.id, edition)
    const { id: document } = await addDocument(t.id, edition)
    const consent = await addConsent(t.id, edition)
    const addOn = await addAddOn(t.id, edition)
    await addAddOnPicture(t.id, edition, addOn)
    const customField = await addCustomField(t.id, edition)
    const merch = await addMerchandiseItem(t.id, edition, { sized: true, pictures: 1 })
    const ticketType = await addTicketType(t.id, edition)
    const desk = await addEdition(t.id)
    await addEditionAccess(t.id, orgId, desk, { tickets: 'write' })
    const deskType = await addTicketType(t.id, desk)
    const shirt = await addMerchandiseItem(t.id, desk, { stock: 5 })
    const otherVariant = await addVariant(t.id, desk, shirt.id, 5)
    const paid = await addOrder(t.id, desk, {
      status: 'paid',
      ticketTypeId: deskType,
      variants: [{ itemId: shirt.id, variantId: shirt.variantId, quantity: 1 }],
    })
    const review = await addOrder(t.id, desk, { status: 'needs-review', ticketTypeId: deskType })
    const lines = (await storedRows('order_lines', t.id)).filter(
      (line) => line.order_id === paid.id,
    )
    const ticketLine = String(lines.find((line) => line.kind === 'ticket')!.id)
    await setColumn('order_lines', ticketLine, 'handed_out_at', new Date().toISOString())
    const scanner = await addScanner(t.id, desk)
    const discountCode = await addDiscountCode(t.id, desk, { ticketTypeIds: [deskType] })
    return {
      t,
      edition,
      org: actor,
      orgId,
      otherId,
      newcomer,
      item,
      document,
      consent,
      addOn,
      customField,
      merch,
      ticketType,
      desk: {
        edition: desk,
        ticketType: deskType,
        paid: paid.id,
        review: review.id,
        ticketLine,
        shirtLine: String(lines.find((line) => line.kind === 'merchandise')!.id),
        otherVariant,
        scanner: scanner.id,
        discountCode: discountCode.id,
      },
    }
  }

  const call = (
    who: Member,
    method: Method,
    path: string,
    body: object | undefined,
    slug: string,
  ) => {
    const agent = request(app.getHttpServer())
    const req = agent[method](path).use(session(who.token)).set('X-Tenant-Slug', slug)
    return (body ? req.send(body) : req).then((res) => res)
  }

  const send = (s: Setup, { method, path, body }: Request) =>
    call(s.org, method, path, body, s.t.slug)

  return { setup, send, call }
}

export const lockTenantWrites = (sql: Sql, t: Setup['t']) =>
  sql`select pg_advisory_xact_lock(${tenantWriteLockKey(t.id)}::bigint)`

/** The kinds of lock in pg_locks that a wait for the tenant's write lock or for a row takes. */
const LOCK_TYPES = { writeLock: ['advisory'], row: ['transactionid', 'tuple'] }

/**
 * Whether `request` comes to wait for the lock of kind `on` that `holder` holds, having passed the
 * checks before it: true once another connection waits for such a lock of the holder, false once
 * the request settles or ten seconds pass first. A wait for another of the holder's locks, such as
 * a row it changed, does not count. Asked on the holder's own connection, since the helpers of
 * tenants.ts share the one the open transaction keeps; the caller commits after it either way.
 */
export async function untilBlocked(
  holder: Sql,
  request: Promise<unknown>,
  on: keyof typeof LOCK_TYPES,
  timeoutMs = 10_000,
) {
  let settled = false
  request.then(
    () => (settled = true),
    () => (settled = true),
  )
  const started = performance.now()
  for (;;) {
    const [row] = await holder<{ blocked: boolean }[]>`
      select exists (
        select 1 from pg_locks
        where not granted
          and locktype = any(${LOCK_TYPES[on]})
          and pg_backend_pid() = any(pg_blocking_pids(pid))
      ) as blocked
    `
    if (row!.blocked) return true
    if (settled || performance.now() - started > timeoutMs) return false
    await sleep(20)
  }
}

/**
 * Keeps `holder` open until the access of the membership has ended by the database's clock, which
 * the re-check of a write reads, so that the write it releases finds the access ended.
 */
export const untilExpired = (holder: Sql, membershipId: string) =>
  holder`
    select pg_sleep(greatest(0, extract(epoch from expires_at - clock_timestamp())) + 0.05)
    from tenant_memberships where id = ${membershipId}
  `
