import { expect, test } from '../fixtures'
import { pl } from '../fixtures/catalog'
import { openPanelAccountMenu, signInToPanel } from '../fixtures/ui'

// The panel's language switcher (PLAN.md 8): the choice is kept on the account through PATCH /me
// and survives a reload.

test('the language chosen in the account menu stays on the account', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })

  await signInToPanel(page, head.email, head.password)
  const sidebar = page.getByRole('navigation', { name: tenant.name })
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()

  await openPanelAccountMenu(page, head.email)
  await page.getByLabel('Interface language').selectOption('pl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  await expect(sidebar.getByRole('link', { name: pl('panel', 'Editions') })).toBeVisible()

  await page.reload()
  await expect(sidebar.getByRole('link', { name: pl('panel', 'Editions') })).toBeVisible()

  // The browser's language again.
  await openPanelAccountMenu(page, head.email)
  await page.getByLabel(pl('panel', 'Interface language')).selectOption('browser')
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
