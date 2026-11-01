import { expect, test } from '../fixtures'
import { portalUrl, signInToPortal } from '../fixtures/ui'

// PLAN.md 15.2, scenario 11, up to the schedule: an attendee likes an item and finds it in the
// personal schedule, then takes the like back. The reviews come with their module.

test('an attendee likes an item and finds it in the schedule', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const attendee = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
  const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
  const item = await tenants.addProgramItem(
    tenant.id,
    edition.id,
    'Dragons across cultures',
    new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
  )
  const itemPage = portalUrl(`/conventions/${tenant.slug}/${edition.slug}/program/${item}`)

  await page.goto(itemPage)
  await expect(page.getByRole('link', { name: 'Sign in to like this item' })).toBeVisible()

  await signInToPortal(page, attendee.email, attendee.password)
  await page.goto(itemPage)
  await expect(page.getByText('0 likes')).toBeVisible()
  await page.getByRole('button', { name: 'Like', exact: true }).click()
  await expect(page.getByText('1 like', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'My schedule' }).click()
  await page.getByRole('link', { name: 'Dragons across cultures' }).click()
  await expect(page).toHaveURL(itemPage)

  await page.getByRole('button', { name: 'Remove the like' }).click()
  await expect(page.getByText('0 likes')).toBeVisible()

  await page.getByRole('link', { name: 'My schedule' }).click()
  await expect(page.getByText('You have not liked any programme items yet.')).toBeVisible()
})
