import { expect, test } from '../fixtures'
import { portalUrl } from '../fixtures/ui'

// The programme shows up on the portal pages of both tenants, signed out,
// each in its own time zone. One instant reads differently on the two pages.

const INSTANT = '2027-06-04T08:00:00.000Z'

test('the programme shows on the page of each convention, in its own zone', async ({
  page,
  accounts,
  tenants,
}) => {
  const [firstHead, secondHead] = [await accounts.create(), await accounts.create()]
  const warsaw = await tenants.create({ headEmail: firstHead.email, timezone: 'Europe/Warsaw' })
  const newYork = await tenants.create({
    headEmail: secondHead.email,
    timezone: 'America/New_York',
  })
  const inWarsaw = await tenants.addEdition(warsaw.id, { isActive: true, isPublished: true })
  const inNewYork = await tenants.addEdition(newYork.id, { isActive: true, isPublished: true })
  const item = await tenants.addProgramItem(warsaw.id, inWarsaw.id, 'Opening in Warsaw', INSTANT)
  await tenants.addProgramItem(newYork.id, inNewYork.id, 'Opening in New York', INSTANT)

  await page.goto(portalUrl(`/conventions/${warsaw.slug}`))
  await expect(page.getByRole('heading', { name: warsaw.name, level: 1 })).toBeVisible()
  const opening = page.getByRole('listitem').filter({ hasText: 'Opening in Warsaw' })
  await expect(opening).toContainText('10:00')
  await expect(page.getByText('Opening in New York')).toBeHidden()

  await page.goto(portalUrl(`/conventions/${newYork.slug}`))
  await expect(page.getByRole('listitem').filter({ hasText: 'Opening in New York' })).toContainText(
    '4:00',
  )

  await page.goto(portalUrl(`/conventions/${warsaw.slug}`))
  await page.getByRole('link', { name: 'Opening in Warsaw' }).click()
  await expect(page).toHaveURL(
    portalUrl(`/conventions/${warsaw.slug}/${inWarsaw.slug}/program/${item}`),
  )
  await expect(page.getByRole('heading', { name: 'Opening in Warsaw', level: 1 })).toBeVisible()
})

test('an unpublished edition has no page', async ({ page, accounts, tenants }) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  const draft = await tenants.addEdition(tenant.id, { isActive: true })

  await page.goto(portalUrl(`/conventions/${tenant.slug}/${draft.slug}`))
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  await page.goto(portalUrl(`/conventions/${tenant.slug}`))
  await expect(page.getByText('No edition of this convention is active.')).toBeVisible()
})
