import { type NestExpressApplication } from '@nestjs/platform-express'
import { type EditionShop } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OrderEmailsOutbox } from '../src/modules/checkout/order-emails.service'
import { PreEditionReminders } from '../src/modules/reminders/pre-edition-reminders.service'
import { createApp } from './app'
import { deleteCreatedAccounts, testEmail } from './auth'
import { deleteMail, waitForMail } from './mailpit'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addOrder,
  addQrCode,
  aQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  openTransaction,
  restore,
  setCatalogSettings,
  setColumn,
  storedRows,
  suspend,
  jobTime,
} from './tenants'

// The pre-edition reminder (docs/specs/0011-pre-edition-reminder.md): a few days before the
// edition every buyer gets one email with the QR code, the opening hours and where to pick up.

let app: NestExpressApplication
const addresses: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await Promise.all(addresses.map((address) => deleteMail(address)))
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

/** The edition starts on 4 June 2027 in Warsaw; three days before, at 9:00, is 07:00 UTC. */
const STARTS = '2027-06-04T08:00:00Z'
const DUE = new Date('2027-06-01T07:00:00Z')
const MINUTE = 60_000

/** A desk whose edition starts on 4 June, with a reminder three days before unless said. */
async function desk(days: number | null = 3) {
  const d = await orderDesk(app)
  // The end first: an edition ends after it starts.
  await setColumn('editions', d.edition, 'ends_at', '2027-06-06T18:00:00Z')
  await setColumn('editions', d.edition, 'starts_at', STARTS)
  if (days !== null) await d.head('patch', '/shop', { reminderDaysBefore: days }).expect(200)
  return d
}
/** The job for one tenant alone: other tests have editions of their own beside this one. */
const run = (d: OrderDesk, now: Date) => app.get(PreEditionReminders).run(now, { tenantId: d.t.id })
const reminders = async (d: OrderDesk) =>
  (await storedRows('order_emails', d.t.id))
    .filter((row) => row.kind === 'pre-edition-reminder')
    .map((row) => [row.order_id, row.recipient])
const shop = async (d: OrderDesk) => (await d.head('get', '/shop').expect(200)).body as EditionShop
/** A paid order with a ticket and a QR code of its own, as its rows alone. */
const paid = async (d: OrderDesk, email: string, values: Parameters<typeof addOrder>[2] = {}) => {
  const order = await addOrder(d.t.id, d.edition, {
    status: 'paid',
    ticketTypeId: d.standard,
    email,
    ...values,
  })
  const codeId = await addQrCode(d.t.id, d.edition, order.id, aQrCode())
  return { ...order, codeId }
}

describe('the settings of the reminder', () => {
  it('are the days before the edition and its opening hours, with the moment it will go out', async () => {
    const d = await desk(null)
    expect(await shop(d)).toMatchObject({
      reminderDaysBefore: null,
      openingHours: null,
      reminderDueAt: null,
      reminderSentAt: null,
    })

    const set = await d
      .head('patch', '/shop', { reminderDaysBefore: 3, openingHours: ' Daily from 10 to 20. ' })
      .expect(200)

    expect(set.body).toMatchObject({
      reminderDaysBefore: 3,
      openingHours: 'Daily from 10 to 20.',
      // 9:00 in the convention's time zone, three days before its first day.
      reminderDueAt: DUE.toISOString(),
      reminderSentAt: null,
    })
    const cleared = await d.head('patch', '/shop', { reminderDaysBefore: null }).expect(200)
    expect(cleared.body).toMatchObject({ reminderDaysBefore: null, reminderDueAt: null })
  })

  it.each([
    ['no day at all', { reminderDaysBefore: 0 }],
    ['more than sixty days', { reminderDaysBefore: 61 }],
    ['half a day', { reminderDaysBefore: 1.5 }],
    ['blank opening hours', { openingHours: ' ' }],
    ['opening hours over 1000 characters', { openingHours: 'h'.repeat(1001) }],
    ['a moment it went out of the org’s own choosing', { reminderSentAt: '2027-01-01T00:00:00Z' }],
  ])('refuse %s', async (_, body) => {
    const d = await desk(null)

    const res = await d.head('patch', '/shop', body).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })
})

describe('the reminder of an edition', () => {
  it('goes out at 9:00 on its day in the convention’s time zone, and not a minute before', async () => {
    const d = await desk()
    const order = await paid(d, 'ada@example.test')

    expect(await run(d, new Date(DUE.getTime() - MINUTE))).toEqual({ editions: 0, queued: 0 })
    expect(await reminders(d)).toEqual([])
    expect(await run(d, DUE)).toEqual({ editions: 1, queued: 1 })

    expect(await reminders(d)).toEqual([[order.id, 'ada@example.test']])
    expect((await shop(d)).reminderSentAt).not.toBeNull()
  })

  it('follows the time zone of the convention', async () => {
    const d = await desk()
    await setColumn('tenants', d.t.id, 'timezone', 'America/New_York')
    await paid(d, 'ada@example.test')

    // The first day is still 4 June in New York; 9:00 there on 1 June is 13:00 UTC.
    expect(await run(d, new Date('2027-06-01T12:59:00Z'))).toMatchObject({ queued: 0 })
    expect(await run(d, new Date('2027-06-01T13:00:00Z'))).toMatchObject({ queued: 1 })
  })

  // R3 and R6: one reminder a QR code an order not canceled still holds.
  it('goes once to each QR code an order not canceled holds, and to no other order', async () => {
    const d = await desk()
    const alone = await paid(d, 'alone@example.test')
    // Two orders on one code, as "Buy more" makes them: one reminder.
    const first = await paid(d, 'shared@example.test', { placedAt: '2027-05-01T10:00:00Z' })
    const more = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      email: 'shared@example.test',
      ageBand: null,
      placedAt: '2027-05-02T10:00:00Z',
    })
    await carry(d, more.id, first.codeId)
    // A shared code with its first order canceled: the reminder goes to the one that remains.
    const gone = await paid(d, 'left@example.test', { status: 'canceled', holds: false })
    const stays = await addOrder(d.t.id, d.edition, { status: 'paid', email: 'left@example.test' })
    await carry(d, stays.id, gone.codeId)
    // A canceled order, one that awaits payment and a manual one get none.
    await paid(d, 'canceled@example.test', { status: 'canceled', holds: false })
    await addOrder(d.t.id, d.edition, { status: 'awaiting-payment', email: 'waits@example.test' })
    await addOrder(d.t.id, d.edition, {
      status: 'paid-manual',
      manualReason: 'desk',
      email: null,
      ticketTypeId: d.standard,
    })

    expect(await run(d, DUE)).toEqual({ editions: 1, queued: 3 })

    expect((await reminders(d)).sort()).toEqual(
      [
        [alone.id, 'alone@example.test'],
        [first.id, 'shared@example.test'],
        [stays.id, 'left@example.test'],
      ].sort(),
    )
  })

  // The recipient is chosen when the email is written: the order it was queued for may be
  // canceled before, while another order on the code is still paid.
  it('goes to another order still paid on the code when its order is canceled before it is written', async () => {
    const d = await desk()
    const first = await paid(d, 'first@example.test', { placedAt: '2027-05-01T10:00:00Z' })
    const more = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      email: 'more@example.test',
      ageBand: null,
      placedAt: '2027-05-02T10:00:00Z',
    })
    await setColumn('orders', more.id, 'paid_at', '2026-01-01T00:00:00Z')
    await carry(d, more.id, first.codeId)
    expect(await run(d, DUE)).toMatchObject({ queued: 1 })
    await setColumn('orders', first.id, 'status', 'canceled')
    await setColumn('orders', first.id, 'holds', false)

    await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })

    const rows = (await storedRows('order_emails', d.t.id)).filter(
      (row) => row.kind === 'pre-edition-reminder',
    )
    expect(rows.map((row) => [row.order_id, row.recipient, row.withdrawn_at !== null])).toEqual([
      [first.id, 'first@example.test', true],
      [more.id, 'more@example.test', false],
    ])
  })

  // R6: an order paid after the reminder went out gets none, also by taking a canceled one's place.
  it('goes to no order on the code paid after it was queued', async () => {
    const d = await desk()
    const first = await paid(d, 'first@example.test', { placedAt: '2027-05-01T10:00:00Z' })
    expect(await run(d, DUE)).toMatchObject({ queued: 1 })
    const later = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      email: 'later@example.test',
      ageBand: null,
    })
    await setColumn('orders', later.id, 'paid_at', '2099-01-01T00:00:00Z')
    await carry(d, later.id, first.codeId)
    await setColumn('orders', first.id, 'status', 'canceled')
    await setColumn('orders', first.id, 'holds', false)

    await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })

    expect(await reminders(d)).toEqual([[first.id, 'first@example.test']])
  })

  // R7: once an edition, whatever runs again or changes afterwards.
  it('goes out once: not when the job runs again, runs twice at once, or the days change', async () => {
    const d = await desk()
    await paid(d, 'ada@example.test')

    const both = await Promise.all([run(d, DUE), run(d, DUE)])
    expect(both.map((result) => result.queued).sort()).toEqual([0, 1])
    expect(await run(d, new Date(DUE.getTime() + MINUTE))).toEqual({ editions: 0, queued: 0 })
    await d.head('patch', '/shop', { reminderDaysBefore: 2 }).expect(200)
    expect(await run(d, new Date('2027-06-02T07:00:00Z'))).toEqual({ editions: 0, queued: 0 })

    expect(await reminders(d)).toHaveLength(1)
    // An order paid after the reminder went out gets none: its confirmation carries the code.
    await paid(d, 'late@example.test')
    expect(await run(d, new Date(DUE.getTime() + 2 * MINUTE))).toMatchObject({ queued: 0 })
  })

  it('goes out for no edition that set no number of days, and none that is not published', async () => {
    const [unset, unpublished] = [await desk(null), await desk()]
    await paid(unset, 'ada@example.test')
    await paid(unpublished, 'ada@example.test')
    await setColumn('editions', unpublished.edition, 'is_published', false)

    for (const d of [unset, unpublished]) {
      expect(await run(d, DUE)).toEqual({ editions: 0, queued: 0 })
      expect(await reminders(d)).toEqual([])
    }
  })

  // R8: a suspended convention sends none, and a missed reminder is not sent late.
  it('is not sent by a suspended convention, nor late once its day has passed', async () => {
    const d = await desk()
    await paid(d, 'ada@example.test')
    await suspend(d.t.id)

    expect(await run(d, DUE)).toEqual({ editions: 0, queued: 0 })
    await restore(d.t.id)
    // The next morning in Warsaw: the day of the reminder has passed.
    expect(await run(d, new Date('2027-06-02T07:00:00Z'))).toEqual({ editions: 0, queued: 0 })

    expect(await reminders(d)).toEqual([])
    expect((await shop(d)).reminderSentAt).toBeNull()
    // Restored on the day itself, it still goes out.
    const sameDay = await desk()
    await paid(sameDay, 'ada@example.test')
    expect(await run(sameDay, new Date('2027-06-01T20:00:00Z'))).toMatchObject({ queued: 1 })
  })
})

/** Puts an order on a QR code another order carries. */
const carry = async (d: OrderDesk, orderId: string, qrCodeId: string) => {
  const tx = await openTransaction()
  await tx.sql`
    insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
    values (${d.t.id}, ${d.edition}, ${orderId}, ${qrCodeId})
  `
  await tx.commit()
}

// R4: the QR code, the opening hours, the pick-up information, and the guardian rules.
describe('what a reminder says', () => {
  const sent = async (ageBand: 'adult' | 'teen' | 'child') => {
    const d = await desk()
    await setCatalogSettings(d.t.id, d.edition, {
      pickupInformation: 'At the desk in hall A.',
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      teenFromAge: 13,
      adultFromAge: 18,
    })
    await d.head('patch', '/shop', { reminderDaysBefore: 3, openingHours: 'Daily, 10 to 20.' })
    const email = testEmail('buyer')
    addresses.push(email)
    await d.paid({
      email,
      emailConfirmation: email,
      ageBand,
      guardianConsentAcknowledged: ageBand === 'teen',
    })
    await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })
    expect(await run(d, DUE)).toMatchObject({ queued: 1 })
    expect(await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })).toMatchObject({
      sent: 1,
    })
    // The confirmation came first; the reminder is the one that says the edition starts soon.
    const mails = await waitForMail(email, 2)
    return mails.find((mail) => /wkrótce/.test(mail.Subject))!
  }

  it('tells an adult the QR code, the opening hours and where to pick up', async () => {
    const mail = await sent('adult')

    // No account under the address: the convention's language, Polish by default.
    expect(mail.Subject).toMatch(/już wkrótce/)
    expect(mail.Text).toMatch(/Kod QR zamówienia \S+: [A-Z2-7]{32}/)
    expect(mail.HTML).toContain('<img src="cid:qr-code@opos"')
    expect(mail.Text).toContain('Daily, 10 to 20.')
    expect(mail.Text).toContain('At the desk in hall A.')
    expect(mail.Text).not.toMatch(/opiekun/i)
  })

  it('tells the buyer of a teen’s ticket of the guardian’s consent, with the form', async () => {
    const mail = await sent('teen')

    expect(mail.Text).toMatch(/pisemną zgodę opiekuna/)
    expect(mail.Text).toContain('https://convention.test/consent.pdf')
  })

  // A "Buy more" order has no age band of its own: the ticket on its code has.
  it('tells the guardian rules of the ticket on the code to an order that holds no ticket', async () => {
    const d = await desk()
    await setCatalogSettings(d.t.id, d.edition, {
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      teenFromAge: 13,
      adultFromAge: 18,
    })
    await d.head('patch', '/shop', { reminderDaysBefore: 3 }).expect(200)
    const email = testEmail('buyer')
    addresses.push(email)
    const ticket = await d.paid({
      email,
      emailConfirmation: email,
      ageBand: 'teen',
      guardianConsentAcknowledged: true,
    })
    await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })
    const more = await addOrder(d.t.id, d.edition, { status: 'paid', email, ageBand: null })
    const [{ qr_code_id: code }] = (await storedRows('order_qr_code_orders', d.t.id)).filter(
      (row) => row.order_id === ticket.orderId,
    ) as [{ qr_code_id: string }]
    await carry(d, more.id, code)
    await setColumn('orders', ticket.orderId, 'status', 'canceled')
    await setColumn('orders', ticket.orderId, 'holds', false)
    expect(await run(d, DUE)).toMatchObject({ queued: 1 })
    expect(await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: d.t.id })).toMatchObject({
      sent: 1,
    })

    const mail = (await waitForMail(email, 2)).find((sent) => /wkrótce/.test(sent.Subject))!
    expect(mail.Text).toMatch(/pisemną zgodę opiekuna/)
  })

  it('tells the buyer of a child’s ticket that a guardian must be present', async () => {
    const mail = await sent('child')

    expect(mail.Text).toMatch(/tylko z opiekunem/)
    expect(mail.Text).not.toContain('https://convention.test/consent.pdf')
  })
})
