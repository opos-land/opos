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

/** Opens the panel's account menu, whose button names the signed-in address. */
export async function openPanelAccountMenu(page: Page, email: string) {
  await page.getByRole('button', { name: email, exact: true }).click()
}

/** Signs out of the panel from the account menu: this session ends, the account's others stay. */
export async function signOutOfPanel(page: Page, email: string) {
  await openPanelAccountMenu(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}
