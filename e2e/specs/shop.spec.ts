import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { waitForMail } from '../fixtures/mailpit'
import { type TenantFactory } from '../fixtures/tenants'
import { expectAccessible, portalUrl, signInToPortal, signOutOfPortal } from '../fixtures/ui'

// Checkout and orders (docs/specs/0004-checkout-and-orders.md, e2e): a buyer goes through the
// shop of an edition on a phone 360 px wide, pays at the fake provider and sees the result. Each
// scenario makes its own convention, and every page of the portal it opens meets WCAG 2.1 AA as
// far as a machine can tell. The fixture `boundary` fails a page that talks to anything but the
// applications and the API.

test.use({ viewport: { width: 360, height: 800 } })

const PROVIDER_CONSENT = /terms of the fake payment provider/

type Accounts = Parameters<Parameters<typeof test>[2]>[0]['accounts']

/** A convention whose coming edition sells: its shop open, with a small catalog. */
async function selling(
  tenants: TenantFactory,
  accounts: Accounts,
  options: Parameters<TenantFactory['sellingShop']>[2] = {},
) {
  const head = await accounts.create()
  // In English, so the fake provider's pay page and the emails read as the scenario does.
  const tenant = await tenants.create({ headEmail: head.email, defaultLocale: 'en' })
  const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
  const catalog = await tenants.sellingShop(tenant.id, edition.id, options)
  const shop = portalUrl(`/conventions/${tenant.slug}/${edition.slug}/shop`)
  return { tenant, edition, catalog, shop }
}

const step = (page: Page, name: string) =>
  expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click()

/**
 * The first step as a visitor fills it. With no age band named, the adult one the step starts
 * with stays.
 */
async function fillHolder(page: Page, email: string, ageBand?: string) {
  await page.getByRole('button', { name: 'Continue without an account' }).click()
  await page.getByLabel('Ticket holder’s name or nickname').fill('Ada Lovelace')
  if (ageBand) await page.getByLabel('Age band').selectOption(ageBand)
  else await expect(page.getByLabel('Age band')).toHaveValue('adult')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Repeat the email address').fill(email)
  await page.getByLabel('City you travel from').fill('Poznań')
}

/** Ticks what placing an order needs: the edition's required consents and the provider's own. */
async function accept(page: Page) {
  await page.getByRole('button', { name: 'Select all required' }).click()
  await page.getByRole('checkbox', { name: PROVIDER_CONSENT }).click()
}

/** What the buyer does at the fake provider, by the name of its button. */
const atProvider = async (page: Page, action: string) => {
  await expect(page.getByRole('heading', { name: 'Fake payment provider' })).toBeVisible()
  await page.getByRole('link', { name: action, exact: true }).click()
}

test(
  'a visitor buys a ticket with an add-on and a T-shirt and sees "Paid"',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts)
    const email = accounts.freshEmail('buyer')

    await page.goto(shop)
    await expect(page.getByRole('heading', { name: 'Shop', level: 1 })).toBeVisible()
    await expect(page.getByText('Every price is a gross amount.')).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('link', { name: 'Choose Standard' }).click()

    await step(page, 'Ticket holder')
    await fillHolder(page, email)
    await expectAccessible(page)
    await next(page)

    await step(page, 'Add-ons')
    await page.getByRole('checkbox', { name: /Workshop/ }).click()
    await expect(page.getByText(/Total: .*160\.00/)).toBeVisible()
    await expectAccessible(page)
    await next(page)

    await step(page, 'Merch')
    const shirt = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'T-shirt' }) })
    await shirt.getByLabel('Variant of T-shirt').selectOption({ label: 'M' })
    await shirt.getByRole('button', { name: 'Add to the order' }).click()
    await expect(page.getByText(/Total: .*240\.00/)).toBeVisible()
    await expectAccessible(page)
    await next(page)

    await step(page, 'Summary')
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByRole('rowheader', { name: 'T-shirt (M)' })).toBeVisible()
    await expect(page.getByText('Merchandise is picked up at the convention.')).toBeVisible()
    await accept(page)
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Order and pay' }).click()

    await atProvider(page, 'Pay')

    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
    await expect(page.getByText('Order number:')).toBeVisible()
    await expectAccessible(page)
    // The address the buyer returned to no longer carries the token.
    expect(new URL(page.url()).search).toBe('')
    expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'paid', email }])

    // The confirmation comes by email, with the QR code, also had the buyer never returned.
    const mail = await waitForMail(email, 1, 45_000)
    expect(mail.Subject).toMatch(/^Your order \S+ for .+ is paid$/)
    expect(mail.Text).toContain('T-shirt (M)')
    expect(mail.Text).toMatch(/The QR code of the order \S+: [A-Z2-7]{32}/)
  },
)

test(
  'a signed-in account buys a ticket under its own email, and the order is its own',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts)
    const buyer = await accounts.create({ metadata: { first_name: 'Jan', last_name: 'Kowal' } })
    await signInToPortal(page, buyer.email, buyer.password)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await step(page, 'Ticket holder')
    // The email is the account's and is not asked; the name is filled in from the account.
    await expect(page.getByRole('button', { name: 'Continue without an account' })).toBeHidden()
    await expect(page.getByLabel('Email address', { exact: true })).toBeHidden()
    await expect(page.getByText(buyer.email)).toBeVisible()
    await expect(page.getByLabel('Ticket holder’s name or nickname')).toHaveValue('Jan Kowal')
    await page.getByLabel('Age band').selectOption('adult')
    await page.getByLabel('City you travel from').fill('Poznań')
    await next(page)
    await next(page)
    await next(page)
    await step(page, 'Summary')
    await accept(page)
    await page.getByRole('button', { name: 'Order and pay' }).click()
    await atProvider(page, 'Pay')

    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
    expect(await tenants.orders(tenant.id)).toMatchObject([
      { status: 'paid', email: buyer.email.toLowerCase(), accountId: buyer.id },
    ])
  },
)

test('an order of merchandise alone', { tag: '@mobile' }, async ({ page, accounts, tenants }) => {
  const { tenant, shop } = await selling(tenants, accounts)
  const email = accounts.freshEmail('buyer')

  await page.goto(shop)
  await page.getByRole('link', { name: 'Order merchandise' }).click()
  await step(page, 'Buyer')
  await page.getByRole('button', { name: 'Continue without an account' }).click()
  // Never an age band or a custom field.
  await expect(page.getByLabel('Age band')).toBeHidden()
  await expect(page.getByLabel('City you travel from')).toBeHidden()
  // Nobody has to be named: the field says so, and stays empty.
  await expect(page.getByLabel('Your name or nickname (optional)')).toHaveValue('')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Repeat the email address').fill(email)
  await expectAccessible(page)
  await next(page)

  await step(page, 'Merch')
  // An order of merchandise alone needs an item.
  await next(page)
  await expect(page.getByText('Add at least one item to order.')).toBeVisible()
  const pin = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Enamel pin' }) })
  await pin.getByLabel('Quantity of Enamel pin').selectOption('3')
  await pin.getByRole('button', { name: 'Add to the order' }).click()
  await next(page)

  await step(page, 'Summary')
  await expect(page.getByRole('rowheader', { name: '3 × Enamel pin' })).toBeVisible()
  await accept(page)
  await page.getByRole('button', { name: 'Order and pay' }).click()
  await atProvider(page, 'Pay')

  await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
  expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'paid', holderName: '' }])
})

test(
  'a teen: the notice, the form, and no order without the acknowledgement',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await fillHolder(page, accounts.freshEmail('buyer'), 'teen')
    await expect(page.getByText(/guardian’s consent on paper/)).toBeVisible()
    await expectAccessible(page)
    await next(page)
    await next(page)
    await next(page)

    await step(page, 'Summary')
    await accept(page)
    await page.getByRole('button', { name: 'Order and pay' }).click()
    // Nothing is placed, and what is missing is marked.
    await expect(page.getByText('Accept this to place the order.')).toBeVisible()
    expect(await tenants.orders(tenant.id)).toEqual([])

    await page.getByRole('checkbox', { name: /guardian’s consent on paper/ }).click()
    await page.getByRole('button', { name: 'Order and pay' }).click()
    await atProvider(page, 'Pay')
    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
  },
)

test(
  'a payment canceled at the provider, then "Try again", then paid',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await fillHolder(page, accounts.freshEmail('buyer'))
    await next(page)
    await next(page)
    await next(page)
    await accept(page)
    await page.getByRole('button', { name: 'Order and pay' }).click()
    await atProvider(page, 'Cancel the payment')

    // The buyer's return is no proof of payment: the order awaits it, and says why it failed.
    await expect(page.getByRole('heading', { name: 'Not paid yet', level: 1 })).toBeVisible()
    await expect(page.getByText('The payment was canceled.')).toBeVisible()
    await expectAccessible(page)
    expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'awaiting-payment' }])

    // Nothing is entered anew.
    await page.getByRole('button', { name: 'Try again' }).click()
    await atProvider(page, 'Pay')
    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
    expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'paid' }])
  },
)

test(
  'a variant that sells out during checkout returns the buyer to the merch step',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, catalog, shop } = await selling(tenants, accounts)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await fillHolder(page, accounts.freshEmail('buyer'))
    await next(page)
    await next(page)
    const shirt = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'T-shirt' }) })
    await shirt.getByLabel('Variant of T-shirt').selectOption({ label: 'M' })
    await shirt.getByRole('button', { name: 'Add to the order' }).click()
    await next(page)
    await step(page, 'Summary')
    await accept(page)

    // The last one goes to somebody else while the buyer reads the summary.
    await tenants.setStock(catalog.shirtVariants.M!, 0)
    await page.getByRole('button', { name: 'Order and pay' }).click()

    await step(page, 'Merch')
    await expect(page.getByText('It ran out while you were ordering.')).toBeVisible()
    expect(await tenants.orders(tenant.id)).toEqual([])
  },
)

test(
  'a total of zero: "Order", and "Paid" with no payment step',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts, { ticketMinor: 0 })

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await fillHolder(page, accounts.freshEmail('buyer'))
    await next(page)
    await next(page)
    await next(page)

    await step(page, 'Summary')
    // Nothing is paid, so the provider's own consent is not asked.
    await expect(page.getByRole('checkbox', { name: PROVIDER_CONSENT })).toBeHidden()
    await page.getByRole('button', { name: 'Select all required' }).click()
    await page.getByRole('button', { name: 'Order', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
    expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'paid' }])
  },
)

test(
  'a reload and Back keep the checkout; a sign-out clears it',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, edition, shop } = await selling(tenants, accounts)
    const buyer = await accounts.create()
    await signInToPortal(page, buyer.email, buyer.password)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await page.getByLabel('Ticket holder’s name or nickname').fill('Ada Lovelace')
    await page.getByLabel('Age band').selectOption('adult')
    await page.getByLabel('City you travel from').fill('Poznań')
    await next(page)
    await step(page, 'Add-ons')
    await page.getByRole('checkbox', { name: /Workshop/ }).click()

    // A reload resumes on the same step with the same data.
    await page.reload()
    await step(page, 'Add-ons')
    await expect(page.getByRole('checkbox', { name: /Workshop/ })).toBeChecked()
    // Back keeps everything entered.
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByLabel('Ticket holder’s name or nickname')).toHaveValue('Ada Lovelace')
    await expect(page.getByLabel('City you travel from')).toHaveValue('Poznań')

    // A sign-out clears it: with nothing kept, the checkout leads back to the shop.
    await page.goto(portalUrl('/account'))
    await signOutOfPortal(page)
    await page.goto(portalUrl(`/conventions/${tenant.slug}/${edition.slug}/shop/checkout`))
    await expect(page).toHaveURL(shop)
  },
)

test(
  'a closed shop shows the org’s message',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, edition, shop } = await selling(tenants, accounts)
    await tenants.closeShop(edition.id, 'We open again in spring.')

    await page.goto(shop)
    await expect(page.getByText('We open again in spring.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Choose/ })).toBeHidden()
    await expectAccessible(page)

    // A checkout cannot be started around the page either.
    await page.goto(
      portalUrl(`/conventions/${tenant.slug}/${edition.slug}/shop/checkout?ticketType=none`),
    )
    await expect(page).toHaveURL(shop)
  },
)

test(
  'a payment refused at the provider shows why and offers "Try again"',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const { tenant, shop } = await selling(tenants, accounts)

    await page.goto(shop)
    await page.getByRole('link', { name: 'Choose Standard' }).click()
    await fillHolder(page, accounts.freshEmail('buyer'))
    await next(page)
    await next(page)
    await next(page)
    await accept(page)
    await page.getByRole('button', { name: 'Order and pay' }).click()
    await atProvider(page, 'Have the card declined')

    await expect(page.getByRole('heading', { name: 'Not paid yet', level: 1 })).toBeVisible()
    await expect(page.getByText('The payment was declined.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(await tenants.orders(tenant.id)).toMatchObject([{ status: 'awaiting-payment' }])
  },
)
