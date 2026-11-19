import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { pdf } from '../fixtures/documents'
import { SELLER } from '../fixtures/tenants'
import { notification, panelUrl, signInToPanel, switchPanelArea } from '../fixtures/ui'

// The setup of a shop (docs/specs/0002-shop-setup.md): what a convention sets once, behind the
// shop permission, and what each edition sets and opens, behind its tickets permission.

/** The conditions of opening, as the edition's shop screen lists them. */
const needs = (page: Page) => page.getByRole('list', { name: 'What opening the shop needs' })

test('a head connects the provider, sets the seller, publishes the documents and opens the shop', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Selling ${tenant.slug}`,
    isActive: true,
  })

  await signInToPanel(page, head.email, head.password)
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  const editionMenu = page.getByRole('navigation', { name: edition.name })
  await editionMenu.getByRole('link', { name: 'Shop' }).click()
  await expect(page.getByText('The shop is closed: nothing can be ordered.')).toBeVisible()
  await expect(needs(page).getByText('Missing')).toHaveCount(4)

  // What belongs to the whole convention: the seller's details and the provider account.
  await switchPanelArea(page, 'Convention settings')
  await page
    .getByRole('navigation', { name: tenant.name })
    .getByRole('link', { name: 'Shop' })
    .click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/settings/shop`))
  const seller = page.getByRole('region', { name: 'Seller’s details' })
  await expect(seller.getByText(/The details are incomplete/)).toBeVisible()
  await seller.getByLabel('Name of the seller').fill('Convention Foundation')
  await seller.getByLabel('Address of the seller').fill('1 Main St, 00-001 Warszawa')
  await seller.getByLabel('Register or tax number').fill('KRS 0000000000')
  await seller.getByLabel('Contact email').fill('shop@convention.test')
  await seller.getByRole('button', { name: 'Save the details' }).click()
  await expect(notification(page, 'success', 'The seller’s details are saved.')).toBeVisible()
  await expect(seller.getByText('The details are complete.')).toBeVisible()

  const account = page.getByRole('region', { name: 'Payment provider account' })
  await expect(account.getByText('No payment provider account is connected.')).toBeVisible()
  await account.getByLabel('Account').fill('account-of-the-scenario')
  await account.getByRole('button', { name: 'Connect the account' }).click()
  await expect(
    notification(page, 'success', 'The payment provider account is connected.'),
  ).toBeVisible()
  await expect(account.getByText('Ready to sell')).toBeVisible()
  // Given and never shown again.
  await expect(account.getByLabel('Account')).toHaveValue('')

  // What belongs to the edition: its documents, each published as a PDF, and a consent.
  await switchPanelArea(page, edition.name)
  await editionMenu.getByRole('link', { name: 'Documents and consents' }).click()
  await expect(page.getByText('The edition has no documents yet.')).toBeVisible()
  for (const [kind, title] of [
    ['Shop terms', 'Shop terms 2027'],
    ['Privacy policy', 'Privacy policy 2027'],
  ] as const) {
    await page.getByLabel('Kind').selectOption({ label: kind })
    await page.getByLabel('Title of the new document').fill(title)
    await page.getByRole('button', { name: 'Add the document' }).click()
    const card = page.getByRole('article', { name: title })
    await expect(card.getByText('No version is published yet.')).toBeVisible()
    await card
      .getByLabel('New version')
      .setInputFiles({ name: `${title}.pdf`, mimeType: 'application/pdf', buffer: pdf() })
    await card.getByRole('button', { name: 'Publish the version' }).click()
    await expect(card.getByRole('link', { name: 'Version 1' })).toBeVisible()
  }
  // A published version is read by anyone, with no session, as a download.
  const address = await page
    .getByRole('article', { name: 'Shop terms 2027' })
    .getByRole('link', { name: 'Version 1' })
    .getAttribute('href')
  const file = await request.get(address!)
  expect(file.status()).toBe(200)
  expect(file.headers()['content-type']).toBe('application/pdf')
  expect(file.headers()['content-disposition']).toMatch(/^attachment/)

  const consents = page.getByRole('region', { name: 'Consents' })
  await consents.getByLabel('Sentence the buyer accepts').fill('I accept the shop terms.')
  await consents.getByLabel('Linked document').selectOption({ label: 'Shop terms 2027' })
  await consents.getByRole('button', { name: 'Add the consent' }).click()
  await expect(notification(page, 'success', 'The consent is added.')).toBeVisible()
  const listed = page.getByRole('list', { name: 'Consents in their order' }).getByRole('listitem')
  await expect(listed).toHaveCount(1)
  await expect(listed).toContainText('I accept the shop terms.')
  await expect(listed).toContainText('Links the document: Shop terms 2027')

  // Every condition holds now, and the shop opens.
  await editionMenu.getByRole('link', { name: 'Shop' }).click()
  await expect(needs(page).getByText('Met')).toHaveCount(4)
  await page.getByRole('button', { name: 'Open the shop' }).click()
  await expect(notification(page, 'success', 'The shop is open.')).toBeVisible()
  await expect(page.getByText(/The shop has been open since/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close the shop' })).toBeVisible()
})

test('an org with the tickets of an edition alone sees each condition as met or missing, and nothing of what stands behind it', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const org = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Gate ${tenant.slug}`,
    isActive: true,
  })
  await tenants.setUpShop(tenant.id, { credentials: { account: 'account-of-the-scenario' } })
  await tenants.addDocument(tenant.id, edition.id, 'shop-terms')
  const membership = await tenants.addOrg(tenant.id, org.id)
  await tenants.addEditionAccess(tenant.id, membership, edition.id, { tickets: 'write' })

  await signInToPanel(page, org.email, org.password)
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  await page
    .getByRole('navigation', { name: edition.name })
    .getByRole('link', { name: 'Shop' })
    .click()

  const rows = needs(page).getByRole('listitem')
  await expect(rows).toHaveCount(4)
  await expect(rows.filter({ hasText: 'payment provider account' })).toContainText('Met')
  await expect(rows.filter({ hasText: 'seller’s details' })).toContainText('Met')
  await expect(rows.filter({ hasText: 'shop terms' })).toContainText('Met')
  await expect(rows.filter({ hasText: 'privacy policy' })).toContainText('Missing')
  // A yes or a no, and no more: neither the details nor the way to them.
  await expect(page.getByRole('link', { name: 'Shop settings of the convention' })).toHaveCount(0)
  await expect(page.getByText(SELLER.name)).toHaveCount(0)

  await page.goto(panelUrl(`/${tenant.slug}/settings/shop`))
  await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
  await expect(page.getByText(SELLER.name)).toHaveCount(0)
})

test('opening a shop with a condition missing is refused, and the page says which', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Early ${tenant.slug}`,
    isActive: true,
  })
  await tenants.setUpShop(tenant.id, { credentials: { account: 'account-of-the-scenario' } })
  await tenants.addDocument(tenant.id, edition.id, 'shop-terms')

  await signInToPanel(page, head.email, head.password)
  await page
    .getByRole('navigation', { name: edition.name })
    .getByRole('link', { name: 'Shop' })
    .click()
  await expect(needs(page).getByText('Met')).toHaveCount(3)
  await page.getByRole('button', { name: 'Open the shop' }).click()

  await expect(
    notification(page, 'warning', 'The shop cannot be opened yet: something it needs is missing.'),
  ).toBeVisible()
  const refusal = page.getByRole('alert').filter({ hasText: 'The shop was not opened' })
  await expect(refusal.getByRole('listitem')).toHaveText([
    'The privacy policy has a published version.',
  ])
  await expect(page.getByText('The shop is closed: nothing can be ordered.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open the shop' })).toBeVisible()
})

test('an org who reads the shop sees the provider account without its credentials, and changes nothing', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const org = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  await tenants.addEdition(tenant.id, { isActive: true })
  const secret = `credential-${tenant.slug}`
  await tenants.setUpShop(tenant.id, { credentials: { account: secret } })
  await tenants.addOrg(tenant.id, org.id, { shopConfig: 'read' })

  // What the API answers of the account, wherever the panel asks for it.
  const answers: string[] = []
  page.on('response', (response) => {
    if (response.url().endsWith('/shop/provider-account')) {
      void response.text().then((body) => answers.push(body))
    }
  })
  await signInToPanel(page, org.email, org.password)
  // The shop is the one section of the convention settings this org opens.
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/settings/shop`))

  const seller = page.getByRole('region', { name: 'Seller’s details' })
  await expect(seller.getByLabel('Name of the seller')).toHaveValue(SELLER.name)
  await expect(seller.getByLabel('Name of the seller')).toBeDisabled()
  await expect(seller.getByRole('button')).toHaveCount(0)

  const account = page.getByRole('region', { name: 'Payment provider account' })
  await expect(account.getByText('Ready to sell')).toBeVisible()
  await expect(account.getByLabel('Account')).toHaveCount(0)
  await expect(account.getByRole('button')).toHaveCount(0)
  expect(await page.content()).not.toContain(secret)
  expect(answers.length).toBeGreaterThan(0)
  expect(answers.join('\n')).not.toContain(secret)
  expect(answers.join('\n')).not.toContain('credentials')
})
