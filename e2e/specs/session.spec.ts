import { type BrowserContext, type Page, type Response } from '@playwright/test'
import { expect, test } from '../fixtures'
import {
  openPanelAccountMenu,
  panelUrl,
  portalUrl,
  signInToPanel,
  signInToPortal,
  signOutOfPanel,
  signOutOfPortal,
} from '../fixtures/ui'

// The session of the panel and of the portal on the API's cookies (PLAN.md 8, 9, 15.2 scenario
// 19): the refresh, two tabs refreshing together, a sign-out that reaches the other tab, and an
// outage during a refresh. They run in a real browser, with real cookies, navigator.locks and
// BroadcastChannel.

const ACCESS_COOKIE = 'opos_panel_access'
const PORTAL_ACCESS_COOKIE = 'opos_portal_access'

const accessCookie = async (context: BrowserContext, name = ACCESS_COOKIE) =>
  (await context.cookies()).find((cookie) => cookie.name === name)

/** What the access cookie's expiry does: the browser stops sending it. */
const expireAccess = (context: BrowserContext, name = ACCESS_COOKIE) =>
  context.clearCookies({ name })

const isRefresh = (response: Response) =>
  new URL(response.url()).pathname === '/auth/refresh' && response.request().method() === 'POST'

async function signedInHead({
  page,
  accounts,
  tenants,
}: Pick<Parameters<Parameters<typeof test>[2]>[0], 'page' | 'accounts' | 'tenants'>) {
  const head = await accounts.create()
  const tenant = await tenants.create({ headEmail: head.email })
  await signInToPanel(page, head.email, head.password)
  const team = panelUrl(`/${tenant.slug}/team`)
  await page.goto(team)
  await expect(page.getByRole('region', { name: 'Invite to the team' })).toBeVisible()
  return { head, tenant, team }
}

test.describe('the panel session', () => {
  test('an expired access cookie is renewed by POST /auth/refresh and the panel stays signed in', async ({
    page,
    accounts,
    tenants,
  }) => {
    const { team } = await signedInHead({ page, accounts, tenants })
    await expireAccess(page.context())
    expect(await accessCookie(page.context())).toBeUndefined()

    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/auth/refresh' &&
        response.request().method() === 'POST',
    )
    await page.goto(team)

    expect((await refreshed).ok()).toBe(true)
    await expect(page.getByRole('region', { name: 'Invite to the team' })).toBeVisible()
    expect(await accessCookie(page.context())).toBeDefined()
  })

  test('two tabs refreshing together both stay signed in', async ({ page, accounts, tenants }) => {
    const { team } = await signedInHead({ page, accounts, tenants })
    const other = await page.context().newPage()
    await other.goto(team)
    await expect(other.getByRole('region', { name: 'Invite to the team' })).toBeVisible()
    await expireAccess(page.context())

    await Promise.all([page.reload(), other.reload()])

    for (const tab of [page, other]) {
      await expect(tab.getByRole('region', { name: 'Invite to the team' })).toBeVisible()
      await expect(tab).not.toHaveURL(/\/login/)
    }
    expect(await accessCookie(page.context())).toBeDefined()
  })

  test('signing out in one tab takes the other tab off the account screens without a reload', async ({
    page,
    accounts,
    tenants,
  }) => {
    const { head, team } = await signedInHead({ page, accounts, tenants })
    const other = await page.context().newPage()
    await other.goto(team)
    await expect(other.getByRole('region', { name: 'Invite to the team' })).toBeVisible()

    await signOutOfPanel(page, head.email)

    await expect(other).toHaveURL(/\/login/)
  })

  test('a refresh answered 503 keeps the account signed in and shows "try again"', async ({
    page,
    accounts,
    tenants,
  }) => {
    const { head, team } = await signedInHead({ page, accounts, tenants })
    await page.route('**/auth/refresh', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'server.unavailable' }),
      }),
    )
    await expireAccess(page.context())

    // Saving the interface language is a request the screen has not made yet, so it needs a session.
    await openPanelAccountMenu(page, head.email)
    await page.getByLabel('Interface language').selectOption('pl')

    await expect(page.getByRole('alert')).toHaveText(
      'The service is temporarily unavailable. Try again in a moment.',
    )
    await expect(page.getByText('Your session has ended')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)

    // The refresh cookie was never spent, so the session is still there once the API answers.
    await page.unroute('**/auth/refresh')
    await page.goto(team)
    await expect(page.getByRole('region', { name: 'Invite to the team' })).toBeVisible()
  })
})

test.describe('the portal session', () => {
  const heading = (page: Page) => page.getByRole('heading', { name: 'Your account' })

  async function signedInAttendee({
    page,
    accounts,
  }: Pick<Parameters<Parameters<typeof test>[2]>[0], 'page' | 'accounts'>) {
    const attendee = await accounts.create()
    await signInToPortal(page, attendee.email, attendee.password)
    await page.goto(portalUrl('/account'))
    await expect(heading(page)).toBeVisible()
    return attendee
  }

  test('an expired access cookie is renewed by POST /auth/refresh and the portal stays signed in', async ({
    page,
    accounts,
  }) => {
    await signedInAttendee({ page, accounts })
    await expireAccess(page.context(), PORTAL_ACCESS_COOKIE)
    expect(await accessCookie(page.context(), PORTAL_ACCESS_COOKIE)).toBeUndefined()

    const refreshed = page.waitForResponse(isRefresh)
    await page.goto(portalUrl('/account'))

    expect((await refreshed).ok()).toBe(true)
    await expect(heading(page)).toBeVisible()
    await expect(page).not.toHaveURL(/\/login/)
    expect(await accessCookie(page.context(), PORTAL_ACCESS_COOKIE)).toBeDefined()
  })

  test('two pages refreshing together both stay signed in', async ({ page, accounts }) => {
    await signedInAttendee({ page, accounts })
    const other = await page.context().newPage()
    await other.goto(portalUrl('/account'))
    await expect(heading(other)).toBeVisible()
    await expireAccess(page.context(), PORTAL_ACCESS_COOKIE)

    await Promise.all([page.reload(), other.reload()])

    for (const tab of [page, other]) {
      await expect(heading(tab)).toBeVisible()
      await expect(tab).not.toHaveURL(/\/login/)
    }
    expect(await accessCookie(page.context(), PORTAL_ACCESS_COOKIE)).toBeDefined()
  })

  test('signing out in one page takes the other off the account screens without a reload', async ({
    page,
    accounts,
  }) => {
    await signedInAttendee({ page, accounts })
    const other = await page.context().newPage()
    await other.goto(portalUrl('/account'))
    await expect(heading(other)).toBeVisible()

    await signOutOfPortal(page)

    await expect(other).toHaveURL(/\/login/)
  })

  test('a refresh answered 503 keeps the account signed in and shows "try again"', async ({
    page,
    accounts,
  }) => {
    await signedInAttendee({ page, accounts })
    await page.route('**/auth/refresh', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'server.unavailable' }),
      }),
    )
    await expireAccess(page.context(), PORTAL_ACCESS_COOKIE)

    // Saving the interface language is a request the screen has not made yet, so it needs a session.
    await page.getByLabel('Interface language').selectOption('pl')

    await expect(page.getByRole('alert')).toHaveText(
      'The service is temporarily unavailable. Try again in a moment.',
    )
    await expect(page.getByText('Your session has ended')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)

    // The refresh cookie was never spent, so the session is still there once the API answers.
    await page.unroute('**/auth/refresh')
    await page.goto(portalUrl('/account'))
    await expect(heading(page)).toBeVisible()
  })
})
