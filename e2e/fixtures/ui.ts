import { expect, type Page } from '@playwright/test'
import { stack } from './stack'

// Signing in through the UI, the way a person does, to the panel or the portal.

/** The demo accounts of the seed (PLAN.md 14); a scenario only reads them and never signs them out. */
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

/** The session auth-js keeps in the application's localStorage (PLAN.md 7.4). */
export async function storedSession(page: Page, key: 'opos-panel-auth' | 'opos-portal-auth') {
  const raw = await page.evaluate((name) => window.localStorage.getItem(name), key)
  return raw ? (JSON.parse(raw) as { access_token: string; refresh_token: string }) : null
}

/** Opens the panel's account menu, whose summary is the signed-in address (PLAN.md 8). */
export async function openPanelAccountMenu(page: Page, email: string) {
  await page.locator('summary', { hasText: email }).click()
}

/** Signs out of the panel from the account menu: every session of the account ends. */
export async function signOutOfPanel(page: Page, email: string) {
  await openPanelAccountMenu(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}
