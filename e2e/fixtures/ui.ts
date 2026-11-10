import { expect, type Page } from '@playwright/test'
import { stack } from './stack'

// Signing in through the UI, the way a person does, to the panel or the portal.

/** The demo accounts of the seed; a scenario only reads them and never signs them out. */
export const seeded = {
  password: 'password123',
  headA: 'head@convention-a.test',
  programA: 'program@convention-a.test',
  viewerA: 'viewer@convention-a.test',
  expiredA: 'expired@convention-a.test',
} as const

async function signIn(page: Page, url: string, email: string, password: string) {
  await page.goto(url)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export const panelUrl = (path = '/') => new URL(path, stack.panel).toString()
export const portalUrl = (path = '/') => new URL(path, stack.portal).toString()

/** Signs in on the panel's `/login` and waits until it leaves the page. */
export const signInToPanel = (page: Page, email: string, password: string) =>
  signIn(page, panelUrl('/login'), email, password)

/** Signs in on the portal's `/login` and waits until it leaves the page. */
export const signInToPortal = (page: Page, email: string, password: string) =>
  signIn(page, portalUrl('/login'), email, password)

/** Signs out of the portal from `/account`, which the page shows: this session ends, the others stay. */
export async function signOutOfPortal(page: Page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
}

/** On a screen under 768 px the panel's sidebar is a sheet over the page: opens it. */
async function revealPanelSidebar(page: Page) {
  if ((page.viewportSize()?.width ?? Infinity) < 768) {
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
  }
}

/** Opens the panel's account menu at the foot of the sidebar, whose button names the signed-in address. */
export async function openPanelAccountMenu(page: Page, email: string) {
  await revealPanelSidebar(page)
  await page.getByRole('button', { name: email }).click()
}

/** Opens the panel's `/account` from the account menu. */
export async function openPanelAccountPage(page: Page, email: string) {
  await openPanelAccountMenu(page, email)
  await page.getByRole('menuitem', { name: 'Account' }).click()
  await expect(page).toHaveURL(panelUrl('/account'))
}

/** Signs out of the panel from the account menu: this session ends, the account's others stay. */
export async function signOutOfPanel(page: Page, email: string) {
  await openPanelAccountMenu(page, email)
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}

/** Opens the switcher at the head of the panel's sidebar: the editions, the convention settings, the conventions. */
export async function openPanelSwitcher(page: Page) {
  await revealPanelSidebar(page)
  await page.locator('[data-slot="sidebar-header"]').getByRole('button').click()
}

/** Opens an edition, the convention settings or another convention from the switcher. */
export async function switchPanelArea(page: Page, choice: string) {
  await openPanelSwitcher(page)
  await page.getByRole('menuitem', { name: choice, exact: true }).click()
}

/**
 * The notification of a write's outcome holding `text`: success, a warning for a refusal or an
 * error for a failure. Several can show at once, so the text picks one.
 */
export const notification = (
  page: Page,
  type: 'success' | 'warning' | 'error',
  text: string | RegExp,
) =>
  page
    .getByRole('region', { name: 'Notifications' })
    .locator(`[data-slot="toast"][data-type="${type}"]`)
    .filter({ hasText: text })
