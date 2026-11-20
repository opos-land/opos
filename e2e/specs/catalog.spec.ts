import { type Locator, type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { picture } from '../fixtures/documents'
import { followFolderLink, notification, panelUrl, portalUrl, signInToPanel } from '../fixtures/ui'

// The catalog of an edition (docs/specs/0003-catalog.md): what it sells and on what terms, set in
// the panel behind the tickets permission of the edition.

const png = (name: string, width = 60, height = 40) => ({
  name,
  mimeType: 'image/png',
  buffer: picture(width, height),
})

/** Adds a price tier to the ticket type's form and fills it. */
async function addTier(page: Page, number: number, price: string, from: string, until: string) {
  await page.getByRole('button', { name: 'Add a price tier' }).click()
  const tier = page.getByRole('group', { name: `Price tier ${number}`, exact: true })
  await tier.getByLabel(/^Price/).fill(price)
  await tier.getByLabel('From').fill(from)
  await tier.getByLabel('Until').fill(until)
}

const menu = (page: Page, edition: string) => page.getByRole('navigation', { name: edition })
const row = (scope: Page | Locator, name: string) =>
  scope.getByRole('row').filter({ has: scope.getByRole('link', { name, exact: true }) })

test('an org builds the catalog of an edition from nothing', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  // Long on purpose: one org sets everything an edition sells, as the first one will.
  test.slow()
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Selling ${tenant.slug}`,
    isActive: true,
    isPublished: true,
  })
  await signInToPanel(page, head.email, head.password)
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  const editionMenu = menu(page, edition.name)

  // Two add-ons: one limited by a capacity, one that only counts interest. Each is added on a
  // page of its own, which leads back to the add-ons.
  await followFolderLink(editionMenu, 'Shop', 'Add-ons')
  await expect(page.getByText('The edition has no add-ons yet.')).toBeVisible()
  await page.getByRole('link', { name: 'New add-on' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Miniature painting workshop')
  await page.getByLabel(/^Price/).fill('40')
  await page.getByLabel('Limit').selectOption('limited')
  await page.getByLabel('Number of places').fill('40')
  await page.getByLabel('Show the places left when fewer than').fill('10')
  await page.getByRole('button', { name: 'Add the add-on' }).click()
  await expect(notification(page, 'success', 'The add-on is added.')).toBeVisible()
  // Back on the list: until then the trail above the page names "New add-on" as a link too.
  await expect(page.getByRole('heading', { name: 'Add-ons', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'New add-on' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Sleeping room')
  await page.getByLabel(/^Price/).fill('0')
  await page.getByLabel('Limit').selectOption('headcount')
  await page.getByRole('button', { name: 'Add the add-on' }).click()
  const addOns = page.getByRole('list', { name: 'Add-ons in their order' }).getByRole('listitem')
  await expect(addOns).toHaveCount(2)
  await expect(addOns.nth(0)).toContainText('Limited places: 40')
  await expect(addOns.nth(1)).toContainText('Headcount only')
  await expect(addOns.nth(1)).toContainText('Free')

  // A T-shirt with two cuts and two sizes: three variants exist, one of them out of stock.
  await followFolderLink(editionMenu, 'Shop', 'Merchandise')
  await page.getByRole('link', { name: 'New item' }).click()
  await page.getByLabel('Name', { exact: true }).fill('T-shirt')
  await page.getByLabel(/^Price/).fill('80')
  await page.getByLabel('Most in a single order').fill('5')
  await page.getByRole('checkbox', { name: 'The pictures are illustrative' }).click()
  await page.getByRole('button', { name: 'Add the item' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'T-shirt' })).toBeVisible()

  const axes = page.getByRole('region', { name: 'Option axes' })
  for (const [number, name, values] of [
    [1, 'Cut', ['Women’s', 'Men’s']],
    [2, 'Size', ['S', 'M']],
  ] as const) {
    await axes.getByRole('button', { name: 'Add an axis' }).click()
    await axes.getByLabel(`Name of axis ${number}`).fill(name)
    await axes.getByLabel(`Value 1 of axis ${number}`).fill(values[0])
    await axes.getByRole('button', { name: `Add a value to axis ${number}` }).click()
    await axes.getByLabel(`Value 2 of axis ${number}`).fill(values[1])
  }
  await axes.getByRole('button', { name: 'Save the axes' }).click()
  // The item had its one variant, which no longer fits two axes: the page asks first.
  const asked = page.getByRole('alertdialog')
  await expect(asked).toContainText('Save the axes and remove variants?')
  await asked.getByRole('button', { name: 'Save the axes' }).click()
  await expect(notification(page, 'success', 'The axes are saved.')).toBeVisible()

  const variants = page.getByRole('region', { name: 'Variants and stock' })
  await expect(variants.getByRole('row')).toHaveCount(5)
  for (const [name, stock] of [
    ['Women’s · S', '25'],
    ['Women’s · M', '0'],
    ['Men’s · M', '30'],
  ] as const) {
    // By its whole name: "Men’s" is the end of "Women’s".
    await variants.getByRole('checkbox', { name: `${name}: exists`, exact: true }).click()
    await variants.getByLabel(`${name}: stock`, { exact: true }).fill(stock)
  }
  await variants.getByRole('button', { name: 'Save the variants and their stock' }).click()
  await expect(
    notification(page, 'success', 'The variants and their stock are saved.'),
  ).toBeVisible()
  // The combination that was not ticked does not exist.
  await expect(
    variants.getByRole('checkbox', { name: 'Men’s · S: exists', exact: true }),
  ).not.toBeChecked()
  await expect(variants.getByLabel('Women’s · S: stock', { exact: true })).toHaveValue('25')

  // A picture, and a size chart for a cut, each an image the API keeps and serves.
  const pictures = page.getByRole('region', { name: 'Pictures' })
  await pictures.getByLabel('New picture').setInputFiles(png('shirt.png', 120, 90))
  await pictures.getByRole('button', { name: 'Add the picture' }).click()
  await expect(notification(page, 'success', 'The picture is added.')).toBeVisible()
  await expect(pictures.getByRole('img', { name: 'Picture 1 of T-shirt' })).toBeVisible()
  const charts = page.getByRole('region', { name: 'Size charts' })
  const womens = charts.getByRole('region', { name: 'Cut: Women’s' })
  await womens.getByLabel('New size chart of Cut: Women’s').setInputFiles(png('chart.png'))
  await womens.getByRole('button', { name: 'Set the size chart' }).click()
  await expect(notification(page, 'success', 'The size chart is saved.')).toBeVisible()
  await expect(womens.getByRole('img', { name: 'Size chart of Cut: Women’s' })).toBeVisible()

  // An item without axes is sold as its one variant.
  await page.getByRole('link', { name: 'All merchandise' }).click()
  await page.getByRole('link', { name: 'New item' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Enamel pin')
  await page.getByLabel(/^Price/).fill('15')
  await page.getByLabel('Most in a single order').fill('10')
  await page.getByRole('button', { name: 'Add the item' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Enamel pin' })).toBeVisible()
  await page.getByLabel('The item itself: stock').fill('200')
  await page.getByRole('button', { name: 'Save the variants and their stock' }).click()
  await expect(
    notification(page, 'success', 'The variants and their stock are saved.'),
  ).toBeVisible()
  await page.getByRole('link', { name: 'All merchandise' }).click()
  await expect(row(page, 'T-shirt')).toContainText('Existing: 3, out of stock: 1')
  await expect(row(page, 'Enamel pin')).toContainText('Existing: 1, out of stock: 0')

  // How merchandise sells: until a deadline without a stock limit, and on its own too.
  await page.getByLabel('Pre-order deadline').fill('2099-05-01T22:00')
  await page.getByLabel('Orders of merchandise alone').selectOption('on')
  await page.getByRole('button', { name: 'Save how merchandise sells' }).click()
  await expect(notification(page, 'success', 'The way merchandise sells is saved.')).toBeVisible()

  // What the edition asks of a ticket holder.
  await followFolderLink(editionMenu, 'Shop', 'Ticket holders’ data')
  await page.getByLabel('A teen from the age of').fill('13')
  await page.getByLabel('An adult from the age of').fill('18')
  await page.getByLabel('Address of the guardian consent form').fill('https://c.test/consent.pdf')
  await page.getByRole('button', { name: 'Save the age bands' }).click()
  await expect(notification(page, 'success', 'The age bands are saved.')).toBeVisible()
  await expect(page.getByText('Ask for nothing sensitive')).toBeVisible()
  for (const [label, answer] of [
    ['City you travel from', 'required'],
    ['Favourite fandom', 'optional'],
  ] as const) {
    // Each field is added on a page of its own, which leads back to the fields.
    await page.getByRole('link', { name: 'New custom field' }).click()
    await page.getByLabel('Question').fill(label)
    await page.getByLabel('Answer').selectOption(answer)
    await page.getByRole('button', { name: 'Add the custom field' }).click()
    await expect(
      page.getByRole('list', { name: 'Custom fields in their order' }).getByText(label),
    ).toBeVisible()
  }

  // Two ticket types: one with two price tiers and supporter prices, one for adults alone.
  await followFolderLink(editionMenu, 'Shop', 'Ticket types')
  await page.getByRole('link', { name: 'New ticket type' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Standard')
  await page.getByLabel('Short description').fill('All three days of the convention.')
  await page.getByLabel('Sale starts').fill('2020-01-01T10:00')
  await page.getByLabel('Sale ends').fill('2099-06-01T10:00')
  await page.getByLabel('Capacity').fill('800')
  await addTier(page, 1, '120', '2020-01-01T10:00', '2099-01-01T00:00')
  await addTier(page, 2, '150', '2099-01-01T00:00', '2099-06-01T10:00')
  for (const [number, amount] of [
    [1, '200'],
    [2, '300'],
  ] as const) {
    await page.getByRole('button', { name: 'Add a supporter price' }).click()
    await page.getByLabel(new RegExp(`^Supporter price ${number}`)).fill(amount)
  }
  await page.getByRole('button', { name: 'Add a perk' }).click()
  await page.getByLabel('Perk 1').fill('A badge with your name')
  for (const offered of ['Miniature painting workshop', 'Sleeping room', 'T-shirt', 'Enamel pin']) {
    await page.getByRole('checkbox', { name: offered }).click()
  }
  await page.getByRole('button', { name: 'Add the ticket type' }).click()
  await expect(notification(page, 'success', 'The ticket type “Standard” is added.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Standard' })).toBeVisible()
  // The saved ticket type fills its form again with what the API holds.
  await expect(page.getByLabel(/^Supporter price 2/)).toHaveValue('300.00')
  await expect(page.getByRole('checkbox', { name: 'T-shirt' })).toBeChecked()

  await page.getByRole('link', { name: 'All ticket types' }).click()
  await page.getByRole('link', { name: 'New ticket type' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Supporter')
  await page.getByLabel('Sale starts').fill('2020-01-01T10:00')
  await page.getByLabel('Sale ends').fill('2099-06-01T10:00')
  await page.getByRole('checkbox', { name: 'Child' }).click()
  await page.getByRole('checkbox', { name: 'Teen' }).click()
  await page.getByRole('checkbox', { name: 'Excluded from discounts' }).click()
  await addTier(page, 1, '400', '2020-01-01T10:00', '2099-06-01T10:00')
  await page.getByRole('button', { name: 'Add the ticket type' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Supporter' })).toBeVisible()

  await page.getByRole('link', { name: 'All ticket types' }).click()
  await expect(row(page, 'Standard')).toContainText('120.00')
  await expect(row(page, 'Standard')).toContainText('800')
  await expect(row(page, 'Supporter')).toContainText('400.00')
  await expect(row(page, 'Supporter')).toContainText('Excluded from discounts')

  // The edition is published and the T-shirt is shown: its picture is for everyone.
  await followFolderLink(editionMenu, 'Shop', 'Merchandise')
  await page.getByRole('link', { name: 'T-shirt', exact: true }).click()
  const shown = page.waitForResponse((response) => response.url().includes('/merchandise-files/'))
  await page.reload()
  const fileId = /merchandise-files\/([0-9a-f-]{36})\//.exec((await shown).url())![1]
  const address = `/public/tenants/${tenant.slug}/merchandise-files/${fileId}/small`
  const everyone = await request.get(new URL(address, (await shown).url()).toString())
  expect(everyone.status()).toBe(200)
  expect(everyone.headers()['content-type']).toBe('image/webp')
})

test('tiers that overlap are refused where they are typed, and by the API too', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, { isActive: true })
  await signInToPanel(page, head.email, head.password)
  await followFolderLink(menu(page, edition.name), 'Shop', 'Ticket types')
  await page.getByRole('link', { name: 'New ticket type' }).click()

  await page.getByLabel('Name', { exact: true }).fill('Standard')
  await page.getByLabel('Sale starts').fill('2099-01-01T10:00')
  await page.getByLabel('Sale ends').fill('2099-06-01T10:00')
  await addTier(page, 1, '120', '2099-01-01T10:00', '2099-03-01T10:00')
  await addTier(page, 2, '150', '2099-02-01T10:00', '2099-06-01T10:00')
  await page.getByRole('button', { name: 'Add the ticket type' }).click()

  await expect(page.getByText(/Two tiers cover the same time/)).toBeVisible()
  await expect(page).toHaveURL(/ticket-types\/new$/)

  // Once the second tier starts where the first one ends, the ticket type is added.
  await page
    .getByRole('group', { name: 'Price tier 2', exact: true })
    .getByLabel('From')
    .fill('2099-03-01T10:00')
  await page.getByRole('button', { name: 'Add the ticket type' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Standard' })).toBeVisible()
  // No tier covers today: the list says the ticket type has no price in force.
  await page.getByRole('link', { name: 'All ticket types' }).click()
  await expect(row(page, 'Standard')).toContainText('No price in force')
})

// A change of the catalog is what the shop sells from the next request on: nothing is published
// in between, and nothing waits for the shop to close.
test('a price changed and an item hidden while the shop is open show in the shop at once', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Open ${tenant.slug}`,
    isActive: true,
    isPublished: true,
  })
  await tenants.sellingShop(tenant.id, edition.id)
  const shop = portalUrl(`/conventions/${tenant.slug}/${edition.slug}/shop`)

  await page.goto(shop)
  await expect(page.getByText('120.00')).toBeVisible()

  await signInToPanel(page, head.email, head.password)
  const editionMenu = menu(page, edition.name)
  await followFolderLink(editionMenu, 'Shop', 'Ticket types')
  await page.getByRole('link', { name: 'Standard', exact: true }).click()
  await page
    .getByRole('group', { name: 'Price tier 1', exact: true })
    .getByLabel(/^Price/)
    .fill('135')
  await page.getByRole('button', { name: 'Save the ticket type' }).click()
  await expect(notification(page, 'success', /saved/)).toBeVisible()
  await followFolderLink(editionMenu, 'Shop', 'Merchandise')
  await row(page, 'Enamel pin').getByRole('button', { name: 'Hide from the shop' }).click()
  await expect(
    row(page, 'Enamel pin').getByRole('button', { name: 'Show in the shop' }),
  ).toBeVisible()

  // The shop shows the new price, and offers the hidden item no longer.
  await page.goto(shop)
  await expect(page.getByText('135.00')).toBeVisible()
  await expect(page.getByText('120.00')).toBeHidden()
  await page.getByRole('link', { name: 'Choose Standard' }).click()
  // The panel's session is not the portal's: here the head buys as a visitor would.
  await page.getByRole('button', { name: 'Continue without an account' }).click()
  await page.getByLabel('Ticket holder’s name or nickname').fill('Ada')
  await page.getByLabel('Age band').selectOption('adult')
  await page.getByLabel('Email address', { exact: true }).fill('buyer@example.test')
  await page.getByLabel('Repeat the email address').fill('buyer@example.test')
  await page.getByLabel('City you travel from').fill('Poznań')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Merch', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'T-shirt' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Enamel pin' })).toBeHidden()
})

test('an org with tickets read access sees the catalog and can change nothing', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const org = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Read ${tenant.slug}`,
    isActive: true,
  })
  const catalog = await tenants.addCatalog(tenant.id, edition.id)
  const membership = await tenants.addOrg(tenant.id, org.id)
  await tenants.addEditionAccess(tenant.id, membership, edition.id, { tickets: 'read' })

  await signInToPanel(page, org.email, org.password)
  const editionMenu = menu(page, edition.name)
  // Everything a screen of the catalog writes with starts with one of these words.
  const writes = page.getByRole('button', {
    name: /^(Save|Add|Delete|Remove|Move|Hide|Show|Set|Replace|Edit)\b/,
  })
  const base = `/${tenant.slug}/editions/${edition.slug}`

  await followFolderLink(editionMenu, 'Shop', 'Ticket types')
  await expect(row(page, 'Standard')).toContainText('120.00')
  await expect(page.getByRole('link', { name: 'New ticket type' })).toHaveCount(0)
  await expect(writes).toHaveCount(0)
  await page.getByRole('link', { name: 'Standard', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Workshop' })).toBeChecked()
  await expect(writes).toHaveCount(0)
  // The page of a new ticket type is not a reader's either.
  await page.goto(panelUrl(`${base}/ticket-types/new`))
  await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()

  await followFolderLink(editionMenu, 'Shop', 'Add-ons')
  await expect(page.getByRole('listitem').filter({ hasText: 'Workshop' })).toContainText(
    'Limited places: 30',
  )
  await expect(writes).toHaveCount(0)
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)

  await followFolderLink(editionMenu, 'Shop', 'Merchandise')
  await expect(row(page, 'Enamel pin')).toContainText('15.00')
  await expect(page.getByLabel('Pre-order deadline')).toBeDisabled()
  await expect(page.getByRole('link', { name: 'New item' })).toHaveCount(0)
  await expect(writes).toHaveCount(0)
  await page.goto(panelUrl(`${base}/merchandise/${catalog.itemId}`))
  await expect(page.getByLabel('The item itself: stock')).toHaveValue('200')
  await expect(page.getByLabel('The item itself: stock')).toBeDisabled()
  await expect(writes).toHaveCount(0)

  await followFolderLink(editionMenu, 'Shop', 'Ticket holders’ data')
  await expect(page.getByText('City you travel from')).toBeVisible()
  await expect(page.getByLabel('A teen from the age of')).toBeDisabled()
  await expect(writes).toHaveCount(0)
})
