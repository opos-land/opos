import { passwordGrant, refreshGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { verifyLinkIn, waitForMail } from '../fixtures/mailpit'
import { portalUrl } from '../fixtures/ui'

// PLAN.md 15.2, scenario 10: password reset from the portal's sign-in screen (PLAN.md 7.6).

const NEW_PASSWORD = 'e2e-new-password-456'

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

    await page.goto(verifyLinkIn(await waitForMail(account.email)))
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Repeat the password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save the new password' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Your new password is saved. You are signed out on every other device.',
    )

    expect(await refreshGrant(other.refresh_token!)).not.toBe(200)
    expect((await passwordGrant(account.email, account.password)).status).toBe(400)
    expect((await passwordGrant(account.email, NEW_PASSWORD)).status).toBe(200)
  },
)
