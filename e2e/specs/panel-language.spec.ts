import { expect, test } from '../fixtures'
import { pl } from '../fixtures/catalog'
import { openPanelAccountPage, panelUrl, signInToPanel } from '../fixtures/ui'

// The panel's language, chosen on /account: the choice is kept on the account through PATCH /me
// and survives loading the panel again.

test('the language chosen on the account page stays on the account', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })

  await signInToPanel(page, head.email, head.password)
  const sidebar = page.getByRole('navigation', { name: tenant.name })
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  const area = page.url()

  await openPanelAccountPage(page, head.email)
  await page.getByLabel('Interface language').selectOption('pl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  await expect(page.getByRole('heading', { name: pl('panel', 'Account'), level: 1 })).toBeVisible()

  await page.goto(area)
  await expect(sidebar.getByRole('link', { name: pl('panel', 'Editions') })).toBeVisible()

  // The browser's language again.
  await page.goto(panelUrl('/account'))
  await page.getByLabel(pl('panel', 'Interface language')).selectOption('browser')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto(area)
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
})
