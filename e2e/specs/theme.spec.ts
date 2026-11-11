import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import {
  notification,
  openPanelAccountPage,
  panelUrl,
  portalUrl,
  signInToPanel,
  signInToPortal,
  signOutOfPanel,
  signOutOfPortal,
} from '../fixtures/ui'

// The interface theme: a signed-in account keeps its choice on the account through PATCH /me, from
// the account page or the toggle on every screen, and with none shows the system's; a visitor with
// no account signed in keeps the toggle's choice in the browser.

const DARK = /(^|\s)dark(\s|$)/

const root = (page: Page) => page.locator('html')
const toggle = (page: Page) => page.getByRole('button', { name: 'Dark theme' })
// Exact: the notification "The interface theme is saved." is labelled by its text too.
const themeSelect = (page: Page) => page.getByLabel('Interface theme', { exact: true })

test(
  'the theme chosen in the portal stays on the account, and the system one follows the system',
  {
    tag: '@mobile',
  },
  async ({ page, accounts }) => {
    const account = await accounts.create()
    await page.emulateMedia({ colorScheme: 'light' })
    await signInToPortal(page, account.email, account.password)
    const theme = themeSelect(page)
    await expect(theme).toHaveValue('system')
    await expect(root(page)).not.toHaveClass(DARK)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(root(page)).toHaveClass(DARK)

    await theme.selectOption('light')
    await expect(notification(page, 'success', 'The interface theme is saved.')).toBeVisible()
    await expect(root(page)).not.toHaveClass(DARK)

    await page.reload()
    await expect(theme).toHaveValue('light')
    await expect(root(page)).not.toHaveClass(DARK)

    // The system's theme again.
    await theme.selectOption('system')
    await expect(root(page)).toHaveClass(DARK)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(root(page)).not.toHaveClass(DARK)
  },
)

test('the panel shows the account theme until the account signs out', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  await page.emulateMedia({ colorScheme: 'light' })

  await signInToPanel(page, head.email, head.password)
  const sidebar = page.getByRole('navigation', { name: tenant.name })
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  await expect(root(page)).not.toHaveClass(DARK)

  await openPanelAccountPage(page, head.email)
  await themeSelect(page).selectOption('dark')
  await expect(notification(page, 'success', 'The interface theme is saved.')).toBeVisible()
  await expect(root(page)).toHaveClass(DARK)

  await page.reload()
  await expect(themeSelect(page)).toHaveValue('dark')
  await expect(root(page)).toHaveClass(DARK)

  await signOutOfPanel(page, head.email)
  await expect(root(page)).not.toHaveClass(DARK)
})

test(
  'the portal toggle keeps a visitor’s theme in the browser and an account’s on the account',
  {
    tag: '@mobile',
  },
  async ({ page, accounts }) => {
    const account = await accounts.create()
    await page.emulateMedia({ colorScheme: 'light' })

    await page.goto(portalUrl('/'))
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
    await toggle(page).click()
    await expect(root(page)).toHaveClass(DARK)
    await page.reload()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(root(page)).toHaveClass(DARK)

    // An account with no theme shows the system's, not the browser's choice.
    await signInToPortal(page, account.email, account.password)
    await expect(root(page)).not.toHaveClass(DARK)

    await toggle(page).click()
    await expect(notification(page, 'success', 'The interface theme is saved.')).toBeVisible()
    await expect(root(page)).toHaveClass(DARK)
    await expect(themeSelect(page)).toHaveValue('dark')
    await toggle(page).click()
    await expect(root(page)).not.toHaveClass(DARK)
    await page.reload()
    await expect(themeSelect(page)).toHaveValue('light')
    await expect(root(page)).not.toHaveClass(DARK)

    // Signed out, the browser's choice again.
    await signOutOfPortal(page)
    await expect(root(page)).toHaveClass(DARK)
  },
)

test('the panel toggle works before sign-in and on the signed-in account', async ({
  page,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  await page.emulateMedia({ colorScheme: 'light' })

  await page.goto(panelUrl('/login'))
  await toggle(page).click()
  await expect(root(page)).toHaveClass(DARK)

  await signInToPanel(page, head.email, head.password)
  const sidebar = page.getByRole('navigation', { name: tenant.name })
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  await expect(root(page)).not.toHaveClass(DARK)

  await toggle(page).click()
  await expect(notification(page, 'success', 'The interface theme is saved.')).toBeVisible()
  await expect(root(page)).toHaveClass(DARK)
  await page.reload()
  await expect(sidebar.getByRole('link', { name: 'Editions' })).toBeVisible()
  await expect(root(page)).toHaveClass(DARK)
  await toggle(page).click()
  await expect(root(page)).not.toHaveClass(DARK)

  await signOutOfPanel(page, head.email)
  await expect(root(page)).toHaveClass(DARK)
})
