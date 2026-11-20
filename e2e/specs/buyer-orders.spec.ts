import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { buy, pay, type Selling, selling } from '../fixtures/buying'
import { type Mail, waitForMail } from '../fixtures/mailpit'
import {
  expectAccessible,
  notification,
  panelUrl,
  portalUrl,
  signInToPanel,
  signInToPortal,
} from '../fixtures/ui'

// Buyer self-service (docs/specs/0009-buyer-self-service.md, e2e), on a phone 360 px wide: a
// visitor opens the order from the email's link, and a signed-in account pays an unpaid order
// and buys more for the same ticket. Every page of the portal a scenario stops at meets
// WCAG 2.1 AA as far as a machine can tell.

test.use({ viewport: { width: 360, height: 800 } })

const PROVIDER_CONSENT = /terms of the fake payment provider/

const conventionPage = (s: Selling) => portalUrl(`/conventions/${s.tenant.slug}`)
const shopPage = (s: Selling) => portalUrl(`/conventions/${s.tenant.slug}/${s.edition.slug}/shop`)
const step = (page: Page, name: string) =>
  expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click()
const yourOrders = (page: Page) => page.getByRole('region', { name: 'Your orders' })

/** The order link an email carries: the portal's address with the token after the `#`. */
function orderLinkIn(mail: Mail) {
  const link = /https?:\/\/[^\s<>]+\/order#[A-Za-z0-9_-]{43}/.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no order link in "${mail.Subject}"`)
  return link
}

/** Ticks what placing an order needs and places it: the buyer lands at the fake provider. */
async function orderAndPay(page: Page) {
  await step(page, 'Summary')
  await page.getByRole('button', { name: 'Select all required' }).click()
  await page.getByRole('checkbox', { name: PROVIDER_CONSENT }).click()
  await page.getByRole('button', { name: 'Order and pay' }).click()
  await expect(page.getByRole('heading', { name: 'Fake payment provider' })).toBeVisible()
}

/** A signed-in account's checkout of the ticket type alone, up to the fake provider. */
async function orderTicket(page: Page, s: Selling) {
  await page.goto(shopPage(s))
  await page.getByRole('link', { name: 'Choose Standard' }).click()
  await step(page, 'Ticket holder')
  await page.getByLabel('Ticket holder’s name or nickname').fill('Ada Lovelace')
  await page.getByLabel('Age band').selectOption('adult')
  await page.getByLabel('City you travel from').fill('Poznań')
  await next(page)
  await next(page)
  await next(page)
  await orderAndPay(page)
}

const payAtProvider = (page: Page) => page.getByRole('link', { name: 'Pay', exact: true }).click()

test(
  'a visitor opens the order from the email’s link and sees the QR code; an expired link sends a fresh one',
  { tag: '@mobile' },
  async ({ page, request, accounts, tenants }) => {
    test.slow()
    const s = await selling(tenants, accounts)
    await tenants.setPickupInformation(s.edition.id, 'At the merchandise desk in hall A.')
    const email = accounts.freshEmail('buyer')
    const order = await buy(request, s, { email, shirt: true })
    await pay(request, order)

    const confirmation = await waitForMail(email, 1, 60_000)
    await page.goto(orderLinkIn(confirmation))

    await expect(
      page.getByRole('heading', { name: `Order ${order.number}`, level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('Paid', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('img', { name: `QR code of the order ${order.number}` }),
    ).toBeVisible()
    // The code under the picture is the one the email carries.
    const code = /The QR code of the order \S+: ([A-Z2-7]{32})/.exec(confirmation.Text)![1]!
    await expect(page.getByText(code)).toBeVisible()
    await expect(page.getByRole('rowheader', { name: 'T-shirt (M)' })).toBeVisible()
    await expect(page.getByText('At the merchandise desk in hall A.')).toBeVisible()
    // Nothing on the page changes the order, and it names no email address.
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0)
    await expect(page.getByText(email)).toBeHidden()
    await expectAccessible(page)

    // The link expires: it shows nothing of the order, and has a fresh one sent.
    await tenants.expireOrderLinks(order.orderId)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'This link has expired', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(order.number)).toBeHidden()
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Send a new link' }).click()
    await expect(page.getByText(/a new link is on its way/)).toBeVisible()

    const fresh = await waitForMail(email, 2, 60_000)
    expect(fresh.Subject).toMatch(/^A new link to your order \S+ for /)
    await page.goto(orderLinkIn(fresh))
    await expect(
      page.getByRole('heading', { name: `Order ${order.number}`, level: 1 }),
    ).toBeVisible()
  },
)

test(
  'a signed-in account pays an unpaid order with "Pay now"',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const s = await selling(tenants, accounts)
    const buyer = await accounts.create()
    await signInToPortal(page, buyer.email, buyer.password)
    // The buyer places an order and leaves the provider without paying.
    await orderTicket(page, s)

    await page.goto(conventionPage(s))
    const orders = yourOrders(page)
    await expect(orders.getByText('Awaiting payment')).toBeVisible()
    await expect(orders.getByRole('button', { name: 'Resend QR code' })).toBeHidden()
    await expectAccessible(page)
    await orders.getByRole('button', { name: 'Pay now' }).click()
    await expect(page.getByRole('heading', { name: 'Fake payment provider' })).toBeVisible()
    await payAtProvider(page)

    // Back on the convention's page, where the order turns "Paid" by itself.
    await expect(page).toHaveURL(conventionPage(s))
    await expect(yourOrders(page).getByText('Paid', { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(yourOrders(page).getByRole('button', { name: 'Pay now' })).toBeHidden()
    expect(await tenants.orders(s.tenant.id)).toMatchObject([
      { status: 'paid', accountId: buyer.id },
    ])

    // "Resend QR code" sends the confirmation again.
    await yourOrders(page).getByRole('button', { name: 'Resend QR code' }).click()
    await expect(
      notification(page, 'success', 'We sent the QR code to the email address of the order.'),
    ).toBeVisible()
  },
)

test(
  'a signed-in account buys a T-shirt with "Buy more", and the scanner shows both orders on one code',
  { tag: '@mobile' },
  async ({ page, browser, accounts, tenants }) => {
    test.slow()
    const s = await selling(tenants, accounts)
    const buyer = await accounts.create()
    await signInToPortal(page, buyer.email, buyer.password)
    await orderTicket(page, s)
    await payAtProvider(page)
    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()

    await page.goto(conventionPage(s))
    await yourOrders(page).getByRole('link', { name: 'Buy more' }).click()
    // No ticket and no ticket holder's step: add-ons, merch, summary.
    await step(page, 'Add-ons')
    await expect(page.getByText(/More for the order \S+/)).toBeVisible()
    await expectAccessible(page)
    await next(page)
    await step(page, 'Merch')
    const shirt = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'T-shirt' }) })
    await shirt.getByLabel('Variant of T-shirt').selectOption({ label: 'M' })
    await shirt.getByRole('button', { name: 'Add to the order' }).click()
    await expect(page.getByText(/Total: .*80\.00/)).toBeVisible()
    await next(page)
    await step(page, 'Summary')
    await expect(page.getByText(/joins the QR code of the order/)).toBeVisible()
    await expectAccessible(page)
    await orderAndPay(page)
    await payAtProvider(page)
    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()

    // Two orders of the account, on one QR code.
    expect(await tenants.orders(s.tenant.id)).toMatchObject([
      { status: 'paid', accountId: buyer.id, totalMinor: 12000 },
      { status: 'paid', accountId: buyer.id, totalMinor: 8000 },
    ])
    expect(await tenants.qrCodesCarried(s.tenant.id)).toEqual({ codes: 1, orders: 2 })
    await page.goto(conventionPage(s))
    await expect(yourOrders(page).getByRole('listitem')).toHaveCount(2)
    const mail = await waitForMail(buyer.email, 2, 60_000)
    const code = /The QR code of the order \S+: ([A-Z2-7]{32})/.exec(mail.Text)![1]!

    // At the gate, a scanner that reads the code shows both orders.
    const desk = await browser.newContext()
    const panel = await desk.newPage()
    await signInToPanel(panel, s.head.email, s.head.password)
    await panel.goto(panelUrl(`/${s.tenant.slug}/editions/${s.edition.slug}/scanners`))
    await panel.getByLabel('Name of the scanner').fill('Main gate')
    await panel.getByRole('button', { name: 'Enable the scanner' }).click()
    const link = await panel.getByText(/\/scanner#[A-Za-z0-9_-]{43}$/).textContent()
    const gate = await browser.newContext({ viewport: { width: 360, height: 800 } })
    const phone = await gate.newPage()
    await phone.goto(link!)
    await expect(phone.getByRole('heading', { name: 'Main gate', level: 1 })).toBeVisible()
    await phone.getByLabel('QR code').fill(code)
    await phone.getByRole('button', { name: 'Read the code' }).click()

    await expect(phone.getByRole('heading', { name: 'Ada Lovelace' })).toHaveCount(2)
    await expect(phone.getByRole('checkbox', { name: 'Entry' })).toBeVisible()
    await expect(phone.getByRole('checkbox', { name: /T-shirt \(M\)/ })).toBeVisible()
    await gate.close()
    await desk.close()
  },
)
