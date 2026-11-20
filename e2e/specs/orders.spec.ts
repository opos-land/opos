import { type APIRequestContext, type Page } from '@playwright/test'
import { BOT_CHECK_STAND_IN, type Offer, type PlacedOrder } from '@opos/contract'
import { expect, test } from '../fixtures'
import { mailTo, waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { type TenantFactory } from '../fixtures/tenants'
import { notification, portalUrl, signInToPanel } from '../fixtures/ui'

// What an org does with an edition's orders in the panel
// (docs/specs/0006-order-management.md): find and read them, correct them, record a sale made
// outside the shop, cancel a paid one and settle one that needs review.

type Accounts = Parameters<Parameters<typeof test>[2]>[0]['accounts']

/** A convention whose coming edition sells, and its head, who manages the orders. */
async function selling(tenants: TenantFactory, accounts: Accounts) {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, defaultLocale: 'en' })
  const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
  const catalog = await tenants.sellingShop(tenant.id, edition.id)
  const shop = `${stack.api}/public/tenants/${tenant.slug}/editions/${edition.slug}/shop`
  return { head, tenant, edition, catalog, shop }
}

type Selling = Awaited<ReturnType<typeof selling>>

/** The T-shirt's variant in M. */
const shirtM = (s: Selling) => s.catalog.shirtVariants.M!

/**
 * A visitor's order as the shop's page would place it: a ticket, with a T-shirt in M when asked,
 * awaiting its payment. Answers the order and the address its buyer pays at.
 */
async function buy(
  request: APIRequestContext,
  s: Selling,
  { email, shirt = false }: { email: string; shirt?: boolean },
) {
  const offer = (await (await request.get(s.shop)).json()) as Offer
  const placed = await request.post(`${s.shop}/orders`, {
    data: {
      cart: {
        ticket: { ticketTypeId: s.catalog.ticketTypeId },
        items: shirt ? [{ variantId: shirtM(s), quantity: 1 }] : [],
      },
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      email,
      emailConfirmation: email,
      customFieldAnswers: offer.customFields.map((field) => ({
        fieldId: field.id,
        answer: 'Poznań',
      })),
      consentIds: offer.consents.map((consent) => consent.id),
      providerConsentAccepted: true,
      expectedTotalMinor: 12000 + (shirt ? 8000 : 0),
      botCheckToken: BOT_CHECK_STAND_IN,
    },
  })
  expect(placed.status()).toBe(201)
  const order = (await placed.json()) as PlacedOrder
  const started = await request.post(
    `${stack.api}/public/tenants/${s.tenant.slug}/orders/${order.orderId}/payment-attempts`,
    { headers: { 'x-result-token': order.resultToken } },
  )
  expect(started.status()).toBe(201)
  const { redirectUrl } = (await started.json()) as { redirectUrl: string }
  return { ...order, payUrl: redirectUrl }
}

/** The buyer pays at the fake provider, which tells the API before it sends the buyer back. */
const pay = (request: APIRequestContext, order: { payUrl: string }) =>
  request.get(`${order.payUrl}/paid`, { maxRedirects: 0 })

/** Signs the head in and opens the orders of the edition. */
async function openOrders(page: Page, s: Selling) {
  await signInToPanel(page, s.head.email, s.head.password)
  await page
    .getByRole('navigation', { name: s.edition.name })
    .getByRole('link', { name: 'Orders', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible()
}

const openOrder = async (page: Page, number: string) => {
  await page.getByRole('link', { name: number, exact: true }).click()
  await expect(page.getByRole('heading', { name: `Order ${number}`, level: 1 })).toBeVisible()
}

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

/** Opens the edition's shop and waits for what it says of the ticket type. */
const shopShows = async (page: Page, s: Selling, state: 'on sale' | 'sold out') => {
  await page.goto(portalUrl(`/conventions/${s.tenant.slug}/${s.edition.slug}/shop`))
  await expect(page.getByRole('heading', { name: 'Shop', level: 1 })).toBeVisible()
  await expect(
    state === 'on sale'
      ? page.getByRole('link', { name: 'Choose Standard' })
      : page.getByText('Sold out', { exact: true }).first(),
  ).toBeVisible()
}

test('an org finds an order by its buyer’s email, corrects the ticket holder’s name and resends the confirmation', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const email = accounts.freshEmail('buyer')
  const order = await buy(request, s, { email })
  await pay(request, order)
  await buy(request, s, { email: accounts.freshEmail('other') })

  await openOrders(page, s)
  await expect(page.getByRole('row')).toHaveCount(3)
  await page.getByLabel('Search').fill(email)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('row')).toHaveCount(2)
  await openOrder(page, order.number)
  await expect(page.getByText('Poznań')).toBeVisible()

  const name = section(page, 'Ticket holder’s name')
  await name.getByLabel('Ticket holder’s name').fill('Grace Hopper')
  await name.getByRole('button', { name: 'Save the name' }).click()
  await expect(
    notification(page, 'success', 'The name is saved, and the buyer is told.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Resend the QR code' }).click()
  await expect(
    notification(page, 'success', 'The confirmation is on its way to the order’s email.'),
  ).toBeVisible()

  // The confirmation twice, and what changed.
  await waitForMail(email, 3, 60_000)
  const subjects = (await mailTo(email)).map((mail) => mail.Subject).sort()
  expect(subjects).toEqual([
    `The ticket holder of your order ${order.number} was changed`,
    expect.stringMatching(/^Your order \S+ for .+ is paid$/),
    expect.stringMatching(/^Your order \S+ for .+ is paid$/),
  ])
})

test('a changed email gives the new address the QR code, and ends the links sent before', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const [old, moved] = [accounts.freshEmail('old'), accounts.freshEmail('moved')]
  const order = await buy(request, s, { email: old })
  await pay(request, order)
  // The confirmation is sent, with the order link the old address holds.
  await waitForMail(old, 1, 60_000)
  expect(await tenants.orderLinks(order.orderId)).toEqual([{ ended: false }])

  await openOrders(page, s)
  await openOrder(page, order.number)
  const form = section(page, 'Email of the order')
  await form.getByLabel('New email address').fill(moved)
  await form.getByRole('button', { name: 'Change the email' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(order.number)
  await expect(dialog).toContainText('stop working')
  await expect(dialog).toContainText('This action cannot be undone.')
  await dialog.getByRole('button', { name: 'Change the email' }).click()
  await expect(
    notification(page, 'success', 'The email is changed, and both addresses are told.'),
  ).toBeVisible()
  await expect(page.getByText(moved).first()).toBeVisible()

  const toNew = await waitForMail(moved, 1, 60_000)
  expect(toNew.Subject).toMatch(/is now under this email address$/)
  expect(toNew.Text).toMatch(/The QR code of the order \S+: [A-Z2-7]{32}/)
  const toOld = await waitForMail(old, 2, 60_000)
  expect(toOld.Subject).toMatch(/was moved to another email address$/)
  // The link sent with the first confirmation opens nothing any more; the new address has its own.
  expect(await tenants.orderLinks(order.orderId)).toEqual([{ ended: true }, { ended: false }])
})

test('a sale at the desk recorded as a manual order lowers what the shop sells', async ({
  page,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  await tenants.setCapacity(s.catalog.ticketTypeId, 1)
  await shopShows(page, s, 'on sale')

  await openOrders(page, s)
  await page.getByRole('link', { name: 'New manual order' }).click()
  await expect(page.getByText(/has no QR code and sends no email/)).toBeVisible()
  await page.getByLabel('Ticket type').selectOption(s.catalog.ticketTypeId)
  await page.getByLabel('Age band').selectOption('adult')
  await page.getByLabel('Note').fill('Paid in cash')
  await page.getByRole('button', { name: 'Record the order' }).click()
  await expect(notification(page, 'success', 'The order is recorded.')).toBeVisible()

  // Its page: paid by hand, handed out as it was recorded, with no QR code.
  await expect(page.getByText('Paid - manual')).toBeVisible()
  await expect(page.getByText('Sale at the desk')).toBeVisible()
  await expect(page.getByText('Paid in cash')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Take back the hand-out of Standard' }),
  ).toBeVisible()
  expect(await tenants.orders(s.tenant.id)).toMatchObject([{ status: 'paid-manual', email: null }])

  // The one ticket there was is sold.
  await shopShows(page, s, 'sold out')
})

test('a paid order is canceled through the modal, and what it held returns', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  await tenants.setCapacity(s.catalog.ticketTypeId, 1)
  const email = accounts.freshEmail('buyer')
  const order = await buy(request, s, { email })
  await pay(request, order)
  await shopShows(page, s, 'sold out')

  await openOrders(page, s)
  await openOrder(page, order.number)
  const cancel = section(page, 'Cancel the order')
  await cancel.getByLabel('Reason of the cancellation').fill('The buyer cannot come')
  await cancel.getByRole('button', { name: 'Cancel the order' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(`Cancel the order ${order.number}?`)
  await expect(dialog).toContainText('OPOS returns no money')
  await dialog.getByRole('button', { name: 'Cancel the order' }).click()
  await expect(notification(page, 'success', 'The order is canceled.')).toBeVisible()
  await expect(page.getByText('The buyer cannot come')).toBeVisible()
  // Canceled, it is corrected and canceled no more.
  await expect(page.getByRole('heading', { name: 'Cancel the order' })).toBeHidden()

  await shopShows(page, s, 'on sale')
  const mail = await waitForMail(email, 2, 60_000)
  expect(mail.Subject).toMatch(/was canceled$/)
})

test('an order in review is listed first, and raising the stock lets the org mark it paid', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const email = accounts.freshEmail('late')
  await pay(request, await buy(request, s, { email: accounts.freshEmail('first') }))
  // Its hold ended and the last T-shirt in M went before the payment arrived.
  const late = await buy(request, s, { email, shirt: true })
  await tenants.expireOrder(late.orderId)
  await tenants.setStock(shirtM(s), 0)
  await pay(request, late)
  await pay(request, await buy(request, s, { email: accounts.freshEmail('last') }))

  await openOrders(page, s)
  await expect(page.getByText(/1 order needs review/)).toBeVisible()
  await expect(page.getByRole('row').nth(1)).toContainText(late.number)
  await expect(page.getByRole('row').nth(1)).toContainText('Needs review')
  await openOrder(page, late.number)
  const review = section(page, 'This order needs review')
  await expect(review).toContainText('what it held was no longer available')

  await review.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(notification(page, 'warning', /no longer available/)).toBeVisible()

  // The org raises the stock, and the order takes what was added.
  await tenants.setStock(shirtM(s), 1)
  await review.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(
    notification(page, 'success', 'The order is paid: its QR code is on its way to the buyer.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This order needs review' })).toBeHidden()
  const mail = await waitForMail(email, 2, 60_000)
  expect(mail.Subject).toMatch(/is paid$/)
})

test('an org with tickets read access sees the orders and can change nothing', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const reader = await accounts.create()
  const orgId = await tenants.addOrg(s.tenant.id, reader.id)
  await tenants.addEditionAccess(s.tenant.id, orgId, s.edition.id, { tickets: 'read' })
  const order = await buy(request, s, { email: accounts.freshEmail('buyer') })
  await pay(request, order)

  await openOrders(page, { ...s, head: reader })
  await expect(page.getByRole('link', { name: 'New manual order' })).toBeHidden()
  await openOrder(page, order.number)
  await expect(page.getByText('Ada Lovelace')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What the order holds' })).toBeVisible()
  for (const name of [
    'Save the name',
    'Change the email',
    'Resend the QR code',
    'Cancel the order',
    'Mark Standard as handed out',
  ]) {
    await expect(page.getByRole('button', { name })).toBeHidden()
  }
})
