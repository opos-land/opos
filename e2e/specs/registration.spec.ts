import { type Request } from '@playwright/test'
import { PASSWORD, refreshGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { verifyLinkIn, waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { portalUrl, signInToPortal, storedSession } from '../fixtures/ui'

// PLAN.md 15.2, scenarios 1-3: registration, confirmation and the session in the portal.

const apiOrigin = new URL(stack.api).origin

/** A call of the portal to the API; a CORS preflight never carries the token. */
const isApiCall = (request: Request) =>
  new URL(request.url()).origin === apiOrigin && request.method() !== 'OPTIONS'

const isSigned = (request: Request) => /^Bearer \S+$/.test(request.headers().authorization ?? '')

test.describe('registration and the session in the portal', () => {
  test(
    'registration with a password: confirmation, sign-in and the language across sessions',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const email = accounts.freshEmail('register')

      await page.goto(portalUrl('/register'))
      await page.getByLabel('First name').fill('Ada')
      await page.getByLabel('Last name').fill('Lovelace')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Create an account' }).click()
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

      // Supabase Auth refuses a password sign-in until the address is confirmed.
      await page.goto(portalUrl('/login'))
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Confirm your email address first. Check your inbox for the link.',
      )

      // The link from the message confirms the address and signs in.
      await page.goto(verifyLinkIn(await waitForMail(email)))
      await expect(page).toHaveURL(portalUrl('/account'))
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
      await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()

      // The language chosen is kept on the account.
      await page.getByLabel('Interface language').selectOption('pl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
      await expect(page.getByRole('heading', { name: 'Twoje konto' })).toBeVisible()

      // Signed out, the portal follows the browser's language again.
      await page.getByRole('button', { name: 'Wyloguj się' }).click()
      await expect(page).toHaveURL(/\/login/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')

      // Signing in again brings the account's language back.
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Twoje konto' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    },
  )

  test('the confirmation link is sent again from the sign-in screen', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create({ confirmed: false })

    await page.goto(portalUrl('/login'))
    await page.getByLabel('Email', { exact: true }).fill(account.email)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Confirm your email address first. Check your inbox for the link.',
    )

    await page.getByRole('button', { name: 'Send the confirmation link again' }).click()
    await expect(page.getByRole('status')).toHaveText(
      `We sent a new confirmation link to ${account.email}.`,
    )
    // The new link confirms the address and signs in.
    await page.goto(verifyLinkIn(await waitForMail(account.email)))
    await expect(page).toHaveURL(portalUrl('/account'))
    await expect(page.getByText(`Signed in as ${account.email}`)).toBeVisible()
  })

  test('the session survives a reload and is gone after sign-out', async ({ page, accounts }) => {
    const account = await accounts.create()
    await signInToPortal(page, account.email, account.password)
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()

    // Signed in, the portal signs its calls to the API with the stored access token.
    const signedMe = page.waitForRequest(
      (request) =>
        isApiCall(request) && new URL(request.url()).pathname === '/me' && isSigned(request),
    )
    await page.reload()
    await signedMe
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    const session = await storedSession(page, 'opos-portal-auth')
    expect(session).not.toBeNull()

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await storedSession(page, 'opos-portal-auth')).toBeNull()

    // An access token stays valid until its exp (PLAN.md 7.4), so the API refuses the session only
    // because the portal sends no token any more: none of its calls carries one, and the refresh
    // token cannot extend the session.
    const signedAfterSignOut: string[] = []
    page.on('request', (request) => {
      if (isApiCall(request) && isSigned(request)) signedAfterSignOut.push(request.url())
    })
    await page.goto(portalUrl('/account'))
    await expect(page).toHaveURL(portalUrl('/login'))
    expect(signedAfterSignOut).toEqual([])
    expect(await refreshGrant(session!.refresh_token)).not.toBe(200)
  })
})
