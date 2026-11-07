import { type BrowserContext, type Request } from '@playwright/test'
import { PASSWORD, passwordGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { pl } from '../fixtures/catalog'
import { confirmLinkIn, waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { portalUrl, signInToPortal, signOutOfPortal } from '../fixtures/ui'

// Registration, confirmation and the session in the portal.

const apiOrigin = new URL(stack.api).origin
const SESSION_COOKIES = ['opos_portal_access', 'opos_portal_refresh']
const CHOSEN_PASSWORD = 'e2e-chosen-password-456'

/** A call of the portal to the API; a CORS preflight carries no cookies. */
const isApiCall = (request: Request) =>
  new URL(request.url()).origin === apiOrigin && request.method() !== 'OPTIONS'

const sessionCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter((cookie) => SESSION_COOKIES.includes(cookie.name))

/** From the link of the message to the account page: the button, then the password. */
async function confirmAndChoosePassword(
  page: Parameters<typeof signInToPortal>[0],
  email: string,
  count: number,
  password: string,
) {
  await page.goto(confirmLinkIn(await waitForMail(email, count)))
  // Opening the link spends nothing; its button signs the browser in, then the password follows.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(`Your address ${email} is confirmed.`)).toBeVisible()
  await page.getByLabel('New password').fill(password)
  await page.getByLabel('Repeat the password').fill(password)
  await page.getByRole('button', { name: 'Save the password' }).click()
  await expect(page).toHaveURL(portalUrl('/account'))
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
}

test.describe('registration and the session in the portal', () => {
  test(
    'registration asks for no password: the link, its button and the password that follows',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const email = accounts.freshEmail('register')

      await page.goto(portalUrl('/register'))
      await page.getByLabel('First name').fill('Ada')
      await page.getByLabel('Last name').fill('Lovelace')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Create an account' }).click()
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

      // Opening the link changes nothing: the account is signed in only once its button is pressed.
      await page.goto(confirmLinkIn(await waitForMail(email)))
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
      expect(await sessionCookies(page.context())).toEqual([])
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByText(`Your address ${email} is confirmed.`)).toBeVisible()
      await page.getByLabel('New password').fill(PASSWORD)
      await page.getByLabel('Repeat the password').fill(PASSWORD)
      await page.getByRole('button', { name: 'Save the password' }).click()
      await expect(page).toHaveURL(portalUrl('/account'))
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
      await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()

      // The language chosen is kept on the account.
      await page.getByLabel('Interface language').selectOption('pl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
      await expect(page.getByRole('heading', { name: pl('portal', 'Your account') })).toBeVisible()

      // Signed out, the portal follows the browser's language again.
      await page.getByRole('button', { name: pl('portal', 'Sign out') }).click()
      await expect(page).toHaveURL(/\/login/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')

      // Signing in again with the password brings the account's language back.
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('heading', { name: pl('portal', 'Your account') })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    },
  )

  test('a password set on the address before it was confirmed does not survive', async ({
    page,
    accounts,
  }) => {
    // Someone else registered the address first, with a password of their own, and never confirmed.
    const squatter = await accounts.create({ confirmed: false, password: 'squatter-password-1' })

    await page.goto(portalUrl('/register'))
    await page.getByLabel('First name').fill('Ada')
    await page.getByLabel('Last name').fill('Lovelace')
    await page.getByLabel('Email', { exact: true }).fill(squatter.email)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

    await confirmAndChoosePassword(page, squatter.email, 1, CHOSEN_PASSWORD)

    expect((await passwordGrant(squatter.email, squatter.password)).status).toBe(400)
    expect((await passwordGrant(squatter.email, CHOSEN_PASSWORD)).status).toBe(200)
  })

  test('the confirmation link is sent again from the "check your inbox" screen', async ({
    page,
    accounts,
  }) => {
    const email = accounts.freshEmail('resend')

    await page.goto(portalUrl('/register'))
    await page.getByLabel('First name').fill('Ada')
    await page.getByLabel('Last name').fill('Lovelace')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
    await waitForMail(email)
    // Supabase Auth sends a confirmation to one address once a second (`max_frequency`).
    await page.waitForTimeout(1_100)

    await page.getByRole('button', { name: 'Send the confirmation link again' }).click()
    await expect(page.getByRole('status')).toHaveText(
      `We sent a new confirmation link to ${email}.`,
    )

    // The second message is the new link, and it works.
    await confirmAndChoosePassword(page, email, 2, CHOSEN_PASSWORD)
  })

  test('an address not confirmed yet is offered the link again at sign-in', async ({
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
    await confirmAndChoosePassword(page, account.email, 1, CHOSEN_PASSWORD)
  })

  test('the session survives a reload on cookies no script can read, and is gone after sign-out', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create()
    await signInToPortal(page, account.email, account.password)
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    const context = page.context()

    // The cookies are the API's: HttpOnly, so the page cannot read them.
    const cookies = await sessionCookies(context)
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual(SESSION_COOKIES)
    expect(cookies.every((cookie) => cookie.httpOnly)).toBe(true)
    expect(await page.evaluate(() => document.cookie)).toBe('')

    // After a reload the portal asks who is signed in with the cookies, and no token.
    const me = page.waitForRequest(
      (request) => isApiCall(request) && new URL(request.url()).pathname === '/me',
    )
    await page.reload()
    const headers = await (await me).allHeaders()
    expect(headers.cookie).toContain('opos_portal_access=')
    expect(headers.authorization).toBeUndefined()
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()

    await signOutOfPortal(page)
    expect(await sessionCookies(context)).toEqual([])

    // Nothing is left to refresh: the API refuses it, and the account page sends to sign-in.
    const refused = await page.request.post(new URL('/auth/refresh', stack.api).toString(), {
      headers: { origin: new URL(stack.portal).origin },
    })
    expect(refused.status()).toBe(401)
    await page.goto(portalUrl('/account'))
    await expect(page).toHaveURL(portalUrl('/login'))
  })
})
