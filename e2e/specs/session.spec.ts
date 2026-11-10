import { type BrowserContext, type Page, type Response } from '@playwright/test'
import { expect, test } from '../fixtures'
import {
  openPanelAccountPage,
  panelUrl,
  portalUrl,
  signInToPanel,
  signInToPortal,
  signOutOfPanel,
  signOutOfPortal,
} from '../fixtures/ui'

// The session of the panel and of the portal on the API's cookies: the refresh, two tabs
// refreshing together, a sign-out that reaches the other tab, another account signing in after a
// sign-out, and an outage during a refresh. They run in a real browser, with real cookies,
// navigator.locks and BroadcastChannel.

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
  const team = panelUrl(`/${tenant.slug}/settings/team`)
  await page.goto(team)
  await expect(page.getByRole('link', { name: 'Invite to the team' })).toBeVisible()
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
    await expect(page.getByRole('link', { name: 'Invite to the team' })).toBeVisible()
    expect(await accessCookie(page.context())).toBeDefined()
  })

  test('two tabs refreshing together both stay signed in', async ({ page, accounts, tenants }) => {
    const { team } = await signedInHead({ page, accounts, tenants })
    const other = await page.context().newPage()
    await other.goto(team)
    await expect(other.getByRole('link', { name: 'Invite to the team' })).toBeVisible()
    await expireAccess(page.context())

    await Promise.all([page.reload(), other.reload()])

    for (const tab of [page, other]) {
      await expect(tab.getByRole('link', { name: 'Invite to the team' })).toBeVisible()
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
    await expect(other.getByRole('link', { name: 'Invite to the team' })).toBeVisible()

    await signOutOfPanel(page, head.email)

    await expect(other).toHaveURL(/\/login/)
  })

  test('another account signing in after a sign-out starts in its own convention, not on the page left behind', async ({
    page,
    accounts,
    tenants,
  }) => {
    const first = await accounts.create()
    const firstTenant = await tenants.create({ headEmail: first.email })
    await tenants.addEdition(firstTenant.id, { name: 'First edition', isActive: true })
    const second = await accounts.create()
    const secondTenant = await tenants.create({ headEmail: second.email })
    const secondEdition = await tenants.addEdition(secondTenant.id, {
      name: 'Second edition',
      isActive: true,
    })

    await signInToPanel(page, first.email, first.password)
    await expect(page.getByRole('navigation', { name: 'First edition' })).toBeVisible()
    await signOutOfPanel(page, first.email)
    // The sign-in screen keeps the page left behind as ?redirect=; the next account signs in there.
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await page.getByLabel('Email', { exact: true }).fill(second.email)
    await page.getByLabel('Password', { exact: true }).fill(second.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page).toHaveURL(panelUrl(`/${secondTenant.slug}/editions/${secondEdition.slug}`))
    await expect(page.getByRole('navigation', { name: 'Second edition' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No permissions' })).toHaveCount(0)
  })

  test('a refresh answered 503 keeps the account signed in and shows "try again"', async ({
    page,
    accounts,
    tenants,
  }) => {
    const { head, team } = await signedInHead({ page, accounts, tenants })
    await openPanelAccountPage(page, head.email)
    await page.route('**/auth/refresh', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'server.unavailable' }),
      }),
    )
    await expireAccess(page.context())

    // Saving the interface language is a request the screen has not made yet, so it needs a session.
    await page.getByLabel('Interface language').selectOption('pl')

    await expect(page.getByRole('alert')).toHaveText(
      'The service is temporarily unavailable. Try again in a moment.',
    )
    await expect(page.getByText('Your session has ended')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)

    // The refresh cookie was never spent, so the session is still there once the API answers.
    await page.unroute('**/auth/refresh')
    await page.goto(team)
    await expect(page.getByRole('link', { name: 'Invite to the team' })).toBeVisible()
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
