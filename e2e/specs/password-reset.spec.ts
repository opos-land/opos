import { type Page } from '@playwright/test'
import { passwordGrant, refreshGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { confirmLinkIn, waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { panelUrl, portalUrl } from '../fixtures/ui'

// PLAN.md 15.2, scenario 10: password reset from the sign-in screen of each application, and the new
// link a used sign-up link gets through its page (PLAN.md 7.6).

const NEW_PASSWORD = 'e2e-new-password-456'

/** Opening a link spends nothing; the button of its page signs in, then the password follows. */
async function choosePassword(page: Page, link: string) {
  await page.goto(link)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByLabel('Repeat the password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Save the password' }).click()
}

test(
  'a password reset sets a new password and ends the other sessions',
  { tag: '@mobile' },
  async ({ page, accounts }) => {
    const account = await accounts.create()
    // A session on another device, which the reset must end.
    const other = await passwordGrant(account.email, account.password)
    expect(other.refresh_token).toBeTruthy()

    await page.goto(portalUrl('/login'))
    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill(account.email)
    await page.getByRole('button', { name: 'Send the link' }).click()
    await expect(page.getByRole('status')).toContainText(`If an account uses ${account.email}`)

    // Opening the link spends nothing; the button of its page signs in, then the password follows.
    await page.goto(confirmLinkIn(await waitForMail(account.email)))
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Repeat the password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save the password' }).click()

    // The caller stays signed in; every other session of the account has ended.
    await expect(page).toHaveURL(portalUrl('/account'))
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    const refused = await refreshGrant(other.refresh_token!)
    expect(refused.code).toBe('refresh_token_not_found')
    expect((await passwordGrant(account.email, account.password)).status).toBe(400)
    expect((await passwordGrant(account.email, NEW_PASSWORD)).status).toBe(200)
  },
)

test('a password reset works from the sign-in screen of the panel', async ({ page, accounts }) => {
  const account = await accounts.create()

  await page.goto(panelUrl('/login'))
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(page.getByRole('status')).toContainText(`If an account uses ${account.email}`)

  await choosePassword(page, confirmLinkIn(await waitForMail(account.email)))

  await expect(page).toHaveURL(panelUrl('/'))
  expect((await passwordGrant(account.email, account.password)).status).toBe(400)
  expect((await passwordGrant(account.email, NEW_PASSWORD)).status).toBe(200)
})

for (const { app, origin, start, home } of [
  { app: 'portal', origin: stack.portal, start: portalUrl, home: '/account' },
  { app: 'panel', origin: stack.panel, start: panelUrl, home: '/' },
]) {
  test(`a used sign-up link gets a password link through its page in the ${app}`, async ({
    page,
    request,
    accounts,
  }) => {
    const email = accounts.freshEmail('used-link')
    const signedUp = await request.post(new URL('/auth/sign-up', stack.api).toString(), {
      // The language of the browser the scenarios run in, which the account then keeps.
      headers: { Origin: new URL(origin).origin, 'Accept-Language': 'en-US' },
      data: { email },
    })
    expect(signedUp.status()).toBe(202)
    const used = confirmLinkIn(await waitForMail(email))
    expect(new URL(used).origin).toBe(new URL(start()).origin)

    // The person presses the button and leaves the password form, so nobody knows the password.
    await page.goto(used)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText(`Your address ${email} is confirmed.`)).toBeVisible()
    await page.context().clearCookies()

    await page.goto(used)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'We could not sign you in' })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send a new link' }).click()
    await expect(page.getByRole('status')).toHaveText(`We sent a new link to ${email}.`)

    const fresh = confirmLinkIn(await waitForMail(email, 2))
    expect(new URL(fresh).searchParams.get('type')).toBe('recovery')
    await choosePassword(page, fresh)

    await expect(page).toHaveURL(start(home))
    expect((await passwordGrant(email, NEW_PASSWORD)).status).toBe(200)
  })
}
