import { expect, test } from '../fixtures'
import { panelUrl, signInToPanel } from '../fixtures/ui'

// PLAN.md 15.2, scenario 4: a head enters the convention into its active edition, creates an
// edition in the convention settings, then activates and publishes it in the edition's own
// settings; the edition active before stops being active (PLAN.md 4.5). The head then adds its
// programme with a speaker.

test('a head creates, activates and publishes an edition', async ({ page, accounts, tenants }) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  await tenants.addEdition(tenant.id, { name: 'This year', slug: 'this-year', isActive: true })

  await signInToPanel(page, head.email, head.password)
  // A single convention opens straight into its active edition.
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/this-year`))

  await page.getByRole('link', { name: 'Convention settings' }).click()
  await page
    .getByRole('navigation', { name: tenant.name })
    .getByRole('link', { name: 'Editions' })
    .click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/settings/editions`))
  await expect(page.getByRole('link', { name: 'This year' })).toBeVisible()

  const create = page.getByRole('region', { name: 'New edition' })
  await create.getByLabel('Name').fill('Next year')
  await create.getByLabel('Address').fill('next-year')
  await create.getByLabel('Starts').fill('2027-06-04T10:00')
  await create.getByLabel('Ends').fill('2027-06-06T18:00')
  await create.getByRole('button', { name: 'Create the edition' }).click()

  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/next-year`))
  await expect(page.getByRole('heading', { name: 'Next year', level: 1 })).toBeVisible()

  // The edition has a menu of its own, and the convention settings' menu is gone.
  const menu = page.getByRole('navigation', { name: 'Next year' })
  await expect(page.getByRole('navigation', { name: tenant.name })).toHaveCount(0)
  await expect(menu.getByRole('link')).toHaveText([
    'Dashboard',
    'Programme',
    'Access',
    'Edition settings',
  ])

  await menu.getByRole('link', { name: 'Edition settings' }).click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/next-year/settings`))
  // The dates are the wall-clock times of the convention's zone.
  await expect(page.getByLabel('Starts')).toHaveValue('2027-06-04T10:00')

  await page.getByRole('button', { name: 'Activate' }).click()
  await expect(page.getByText("This is the convention's active edition.")).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(
    page.getByText('The edition is published: the portal shows it to everyone.'),
  ).toBeVisible()

  expect([...(await tenants.editions(tenant.id))]).toEqual([
    { slug: 'next-year', isActive: true, isPublished: true },
    { slug: 'this-year', isActive: false, isPublished: false },
  ])

  // The switch of the top bar leads to another edition; the way back from the convention settings
  // to the active one, now the new edition.
  await page.getByRole('banner').getByLabel('Edition').selectOption({ label: 'This year' })
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/this-year`))
  await page.getByRole('link', { name: 'Convention settings' }).click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/settings`))
  await page.getByRole('link', { name: 'Back to the edition' }).click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/next-year`))
})

test('a head adds a programme item with a speaker', async ({ page, accounts, tenants }) => {
  const head = await accounts.create()
  const speaker = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  await tenants.addEdition(tenant.id, { name: 'This year', slug: 'this-year' })

  await signInToPanel(page, head.email, head.password)
  await page.goto(panelUrl(`/${tenant.slug}/editions/this-year`))
  await page
    .getByRole('navigation', { name: 'This year' })
    .getByRole('link', { name: 'Programme' })
    .click()
  await expect(page.getByText('There are no programme items yet.')).toBeVisible()

  const create = page.getByRole('region', { name: 'New programme item' })
  await create.getByLabel('Title').fill('Opening ceremony')
  await create.getByLabel('Starts').fill('2027-06-04T10:00')
  await create.getByLabel('Ends').fill('2027-06-04T11:00')
  await create.getByRole('button', { name: 'Add the item' }).click()

  await expect(page.getByRole('heading', { name: 'Opening ceremony', level: 1 })).toBeVisible()
  // The dates are the wall-clock times of the convention's zone.
  await expect(page.getByLabel('Starts')).toHaveValue('2027-06-04T10:00')

  const speakers = page.getByRole('region', { name: 'Speakers' })
  await speakers.getByLabel('Speaker email').fill(speaker.email)
  await speakers.getByRole('button', { name: 'Add' }).click()
  await expect(speakers.getByRole('button', { name: `Remove ${speaker.email}` })).toBeVisible()

  await speakers.getByLabel('Speaker email').fill('nobody@example.test')
  await speakers.getByRole('button', { name: 'Add' }).click()
  await expect(speakers.getByRole('alert')).toContainText('nobody@example.test')

  await page.getByRole('link', { name: 'All programme items' }).click()
  await expect(page.getByRole('link', { name: 'Opening ceremony' })).toBeVisible()
})
