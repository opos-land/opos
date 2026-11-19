import { type Locator, type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { png } from '../fixtures/pictures'
import { notification, panelUrl, portalUrl, signInToPanel, switchPanelArea } from '../fixtures/ui'

// The list of editions on the portal's home page and the page of an edition
// (docs/specs/0014-edition-list-and-edition-page.md). The list holds the editions of every
// convention, the seed's and the other scenarios' among them: a scenario looks for its own rows.

const coming = (page: Page) => page.getByRole('region', { name: 'Coming editions' })
const past = (page: Page) => page.getByRole('region', { name: 'Past editions' })

/** The row of an edition in a part of the list, reading more rows until it is there. */
async function row(part: Locator, name: string) {
  const item = part.getByRole('listitem').filter({ hasText: name })
  const more = part.getByRole('button', { name: 'Show more' })
  await expect(part.getByRole('listitem').first()).toBeVisible()
  while ((await item.count()) === 0 && (await more.count()) > 0) {
    const shown = await part.getByRole('listitem').count()
    await more.click()
    await expect(part.getByRole('listitem')).not.toHaveCount(shown)
  }
  return item
}

test(
  'a visitor finds a coming edition on the home page and follows it to its programme',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
    const next = await tenants.addEdition(tenant.id, {
      name: `Next ${tenant.slug}`,
      startsInDays: 1,
      isActive: true,
      isPublished: true,
      venue: { name: 'Congress Hall', address: '1 Main St', city: 'Poznań' },
    })
    const last = await tenants.addEdition(tenant.id, {
      name: `Last ${tenant.slug}`,
      startsInDays: -5,
      isPublished: true,
    })
    await tenants.addProgramItem(
      tenant.id,
      next.id,
      'Opening ceremony',
      new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    )

    await page.goto(portalUrl('/'))
    await expect(
      page.getByRole('heading', { name: 'Fantasy conventions, in one place' }),
    ).toBeVisible()
    await expect(await row(past(page), last.name)).toBeVisible()
    await expect(coming(page).getByRole('link', { name: last.name })).toHaveCount(0)
    const found = await row(coming(page), next.name)
    await expect(found).toContainText('Poznań')

    await found.getByRole('link', { name: next.name }).click()
    await expect(page).toHaveURL(portalUrl(`/conventions/${tenant.slug}/${next.slug}`))
    await expect(page.getByRole('heading', { name: next.name, level: 1 })).toBeVisible()
    await expect(page.getByText('Congress Hall')).toBeVisible()
    await expect(page.getByText('1 Main St')).toBeVisible()
    await expect(page.getByText('Poznań')).toBeVisible()
    await expect(page.getByRole('link', { name: tenant.name })).toHaveAttribute(
      'href',
      `/conventions/${tenant.slug}`,
    )

    await page.getByRole('link', { name: 'See the programme' }).click()
    await expect(page).toHaveURL(portalUrl(`/conventions/${tenant.slug}/${next.slug}/program`))
    await expect(page.getByRole('link', { name: 'Opening ceremony' })).toBeVisible()
    await page.getByRole('link', { name: `Back to ${next.name}` }).click()
    await expect(page).toHaveURL(portalUrl(`/conventions/${tenant.slug}/${next.slug}`))
  },
)

test('a head sets the logo and the venue, and the portal shows both', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Shown ${tenant.slug}`,
    startsInDays: 2,
    isActive: true,
    isPublished: true,
  })

  await signInToPanel(page, head.email, head.password)
  // A single convention opens straight into its active edition; the switcher is asked once there.
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  await switchPanelArea(page, 'Convention settings')
  await page
    .getByRole('navigation', { name: tenant.name })
    .getByRole('link', { name: 'Branding' })
    .click()
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/settings/branding`))
  await expect(page.getByText('The convention has no logo.')).toBeVisible()
  await page
    .getByLabel('Logo file')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png(240, 120) })
  await page.getByRole('button', { name: 'Upload the logo' }).click()
  await expect(notification(page, 'success', 'The logo is saved.')).toBeVisible()
  await expect(page.getByRole('img', { name: `The logo of ${tenant.name}` })).toBeVisible()

  await switchPanelArea(page, edition.name)
  await page
    .getByRole('navigation', { name: edition.name })
    .getByRole('link', { name: 'Edition settings' })
    .click()
  const data = page.getByRole('region', { name: 'Edition data' })
  await data.getByLabel('Venue', { exact: true }).fill('Old Brewery Hall')
  await data.getByLabel('City').fill('Gniezno')
  await data.getByRole('button', { name: 'Save' }).click()
  await expect(notification(page, 'success', 'The edition is saved.')).toBeVisible()

  await page.goto(portalUrl('/'))
  const found = await row(coming(page), edition.name)
  await expect(found).toContainText('Gniezno')
  // Beside the name the picture says nothing of its own, so it has no role to find it by.
  const small = found.locator('img')
  await expect(small).toHaveAttribute('src', /\/logo-files\/[0-9a-f-]+\/small$/)
  // The picture came: the API serves it to a visitor, and the page may show it.
  await expect
    .poll(() => small.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0)

  await found.getByRole('link', { name: edition.name }).click()
  await expect(page.getByText('Old Brewery Hall')).toBeVisible()
  await expect(page.getByText('Gniezno')).toBeVisible()
  const large = page.locator('img')
  await expect(large).toHaveAttribute('src', /\/logo-files\/[0-9a-f-]+\/large$/)
  await expect
    .poll(() => large.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0)
})

test('an edition is on the list only while it is published', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Draft ${tenant.slug}`,
    startsInDays: 1,
    isActive: true,
  })

  await page.goto(portalUrl('/'))
  await expect(coming(page).getByRole('listitem').first()).toBeVisible()
  await expect(await row(coming(page), edition.name)).toHaveCount(0)

  await signInToPanel(page, head.email, head.password)
  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  await page
    .getByRole('navigation', { name: edition.name })
    .getByRole('link', { name: 'Edition settings' })
    .click()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(
    page.getByText('The edition is published: the portal shows it to everyone.'),
  ).toBeVisible()

  await page.goto(portalUrl('/'))
  await expect(await row(coming(page), edition.name)).toBeVisible()

  await page.goto(panelUrl(`/${tenant.slug}/editions/${edition.slug}/settings`))
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(
    page.getByText('The edition is not published: the portal does not show it.'),
  ).toBeVisible()

  await page.goto(portalUrl('/'))
  await expect(coming(page).getByRole('listitem').first()).toBeVisible()
  await expect(await row(coming(page), edition.name)).toHaveCount(0)
})

test(
  "the convention's page shows its active edition and leads to a past one",
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
    const active = await tenants.addEdition(tenant.id, {
      name: 'This year',
      startsInDays: 30,
      isActive: true,
      isPublished: true,
      venue: { name: 'Congress Hall', city: 'Poznań' },
    })
    const lastYear = await tenants.addEdition(tenant.id, {
      name: 'Last year',
      startsInDays: -300,
      isPublished: true,
      venue: { city: 'Gniezno' },
    })
    await tenants.addEdition(tenant.id, { name: 'Not yet announced', startsInDays: 400 })

    await page.goto(portalUrl(`/conventions/${tenant.slug}`))
    await expect(page.getByRole('heading', { name: tenant.name, level: 1 })).toBeVisible()
    const shown = page.getByRole('region', { name: active.name })
    await expect(shown).toContainText('Congress Hall')
    await expect(shown).toContainText('Poznań')
    await expect(shown.getByRole('link', { name: 'See the programme' })).toHaveAttribute(
      'href',
      `/conventions/${tenant.slug}/${active.slug}/program`,
    )

    const others = page.getByRole('region', { name: 'Other editions' })
    await expect(others.getByRole('link')).toHaveText(['Last year'])
    await others.getByRole('link', { name: 'Last year' }).click()
    await expect(page).toHaveURL(portalUrl(`/conventions/${tenant.slug}/${lastYear.slug}`))
    await expect(page.getByRole('heading', { name: 'Last year', level: 1 })).toBeVisible()
    await expect(page.getByText('Gniezno')).toBeVisible()
  },
)
