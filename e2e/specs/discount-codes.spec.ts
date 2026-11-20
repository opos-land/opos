import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { type Selling, selling } from '../fixtures/buying'
import { waitForMail } from '../fixtures/mailpit'
import {
  expectAccessible,
  followFolderLink,
  notification,
  portalUrl,
  signInToPanel,
} from '../fixtures/ui'

// Discount codes (docs/specs/0008-discount-codes.md, e2e): an org sets a code in the panel, and a
// buyer enters it at the Summary of the checkout. Each scenario makes its own convention, and the
// Summary with a code meets WCAG 2.1 AA as far as a machine can tell.

const PROVIDER_CONSENT = /terms of the fake payment provider/

const shopOf = (s: Selling) => portalUrl(`/conventions/${s.tenant.slug}/${s.edition.slug}/shop`)

/** A visitor's checkout of the ticket type alone, up to the Summary. */
async function toSummary(page: Page, s: Selling, email: string) {
  await page.goto(shopOf(s))
  await page.getByRole('link', { name: 'Choose Standard' }).click()
  await page.getByRole('button', { name: 'Continue without an account' }).click()
  await page.getByLabel('Ticket holder’s name or nickname').fill('Ada Lovelace')
  await page.getByLabel('Age band').selectOption('adult')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Repeat the email address').fill(email)
  await page.getByLabel('City you travel from').fill('Poznań')
  for (const step of ['Add-ons', 'Merch', 'Summary']) {
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: step, level: 2 })).toBeVisible()
  }
}

const apply = async (page: Page, code: string) => {
  await page.getByLabel('Discount code').fill(code)
  await page.getByRole('button', { name: 'Apply the code' }).click()
}

const totalDue = (page: Page) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Total due' }) })

test('an org makes a code, and a buyer who enters it sees the discount’s line and the new total', async ({
  page,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)

  await signInToPanel(page, s.head.email, s.head.password)
  await followFolderLink(
    page.getByRole('navigation', { name: s.edition.name }),
    'Shop',
    'Discount codes',
  )
  await expect(page.getByRole('heading', { name: 'Discount codes', level: 1 })).toBeVisible()
  await expect(page.getByText('The edition has no discount codes yet.')).toBeVisible()
  // A code is added on a page of its own, which leads back to the codes.
  await page.getByRole('link', { name: 'New discount code' }).click()
  await expect(page.getByRole('heading', { name: 'New discount code', level: 1 })).toBeVisible()
  await page.getByLabel('Code', { exact: true }).fill('Early-25')
  await page.getByLabel('Percent off').fill('25')
  await page.getByRole('checkbox', { name: 'Standard' }).click()
  await page.getByLabel('Usage limit').fill('10')
  await page.getByRole('button', { name: 'Add the code' }).click()
  await expect(notification(page, 'success', 'The code is added.')).toBeVisible()
  // The codes are a table: the new one is a row with its uses and what it applies to.
  const row = page.getByRole('row').filter({ hasText: 'EARLY-25' })
  await expect(row.getByRole('cell', { name: '0 of 10' })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'Standard' })).toBeVisible()

  const email = accounts.freshEmail('buyer')
  await toSummary(page, s, email)
  await expect(totalDue(page)).toContainText('120.00')
  await apply(page, 'early-25')

  await expect(page.getByRole('rowheader', { name: 'Discount code EARLY-25' })).toBeVisible()
  await expect(totalDue(page)).toContainText('90.00')
  await expect(page.getByText('Code EARLY-25 is applied.')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Select all required' }).click()
  await page.getByRole('checkbox', { name: PROVIDER_CONSENT }).click()
  await page.getByRole('button', { name: 'Order and pay' }).click()
  await expect(page.getByRole('heading', { name: 'Fake payment provider' })).toBeVisible()

  // The order holds a use of the code from the moment it is placed.
  expect(await tenants.orders(s.tenant.id)).toMatchObject([
    { status: 'awaiting-payment', email, totalMinor: 9000 },
  ])
})

// The two scenarios of the portal alone also run on a phone.
test(
  'a guest checks out with a 100% code and gets a QR code with no payment step',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const s = await selling(tenants, accounts)
    await tenants.addDiscountCode(s.tenant.id, s.edition.id, {
      code: 'guest-100',
      percent: 100,
      ticketTypeIds: [s.catalog.ticketTypeId],
    })
    const email = accounts.freshEmail('guest')

    await toSummary(page, s, email)
    await apply(page, 'GUEST-100')

    await expect(page.getByRole('rowheader', { name: 'Discount code GUEST-100' })).toBeVisible()
    await expect(totalDue(page)).toContainText('0.00')
    // Nothing is paid, so the provider's own consent is not asked for.
    await expect(page.getByRole('checkbox', { name: PROVIDER_CONSENT })).toBeHidden()
    await page.getByRole('button', { name: 'Select all required' }).click()
    await page.getByRole('button', { name: 'Order', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Paid', level: 1 })).toBeVisible()
    expect(await tenants.orders(s.tenant.id)).toMatchObject([
      { status: 'paid', email, totalMinor: 0 },
    ])
    const mail = await waitForMail(email, 1, 45_000)
    expect(mail.Subject).toMatch(/^Your order \S+ for .+ is paid$/)
    expect(mail.Text).toMatch(/The QR code of the order \S+: [A-Z2-7]{32}/)
  },
)

test(
  'a code that cannot be used shows one message, whatever is wrong with it',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const s = await selling(tenants, accounts)
    await tenants.addDiscountCode(s.tenant.id, s.edition.id, {
      code: 'ended-50',
      percent: 50,
      ticketTypeIds: [s.catalog.ticketTypeId],
      ended: true,
    })

    await toSummary(page, s, accounts.freshEmail('buyer'))
    const refusal = page.getByText('This code cannot be used for this order.')
    await apply(page, 'never-made')
    await expect(refusal).toBeVisible()
    await expectAccessible(page)
    await apply(page, 'ended-50')
    await expect(refusal).toBeVisible()

    await expect(page.getByRole('rowheader', { name: /Discount code/ })).toBeHidden()
    await expect(totalDue(page)).toContainText('120.00')
    await expect(page.getByRole('button', { name: 'Order and pay' })).toBeEnabled()
  },
)
