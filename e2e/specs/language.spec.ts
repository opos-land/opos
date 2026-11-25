import { expect, test } from '../fixtures'
import { pl } from '../fixtures/catalog'
import { openPanelAccountPage, panelUrl, portalUrl, signInToPanel } from '../fixtures/ui'

// The interface language: Polish until one is chosen, whatever the browser asks for (English in
// these scenarios). A visitor's choice stays in the browser, an account's on the account.

test.describe('with no language chosen in the browser', () => {
  test.use({ visitorLocale: null })

  test('a visitor sees Polish until choosing another language in the header', async ({ page }) => {
    await page.goto(portalUrl('/'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    const switcher = page
      .getByRole('banner')
      .getByRole('combobox', { name: pl('portal', 'Language') })
    await expect(switcher).toHaveValue('pl')

    await switcher.selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible()

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('banner').getByRole('combobox', { name: 'Language' })).toHaveValue(
      'en',
    )

    // Each application keeps its own choice: the panel is still in Polish.
    await page.goto(panelUrl('/login'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(
      page.getByRole('button', { name: pl('panel', 'Sign in'), exact: true }),
    ).toBeVisible()
  })
})

test('an account with no language of its own is in Polish until it chooses one', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create({ metadata: { locale: '' } })
  const tenant = await tenants.create({ headEmail: head.email })

  // Signed in from a browser that chose English for its visits with no account.
  await signInToPanel(page, head.email, head.password)
  const sidebar = page.getByRole('navigation', { name: tenant.name })
  await expect(sidebar.getByRole('link', { name: pl('panel', 'Editions') })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')

  await page.getByRole('combobox', { name: pl('panel', 'Language') }).selectOption('en')
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()

  // Kept on the account, over the language this browser keeps for the visits with no account.
  await page.evaluate(() => window.localStorage.setItem('opos-panel-locale', 'pl'))
  await page.reload()
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

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

  await page.goto(panelUrl('/account'))
  await page.getByLabel(pl('panel', 'Interface language')).selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto(area)
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
})
