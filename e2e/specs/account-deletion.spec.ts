import { passwordGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { accountIds } from '../fixtures/tenants'
import { notification, portalUrl, signInToPortal } from '../fixtures/ui'

// DELETE /me after the password confirms it is the account's owner.

test.describe('account deletion in the portal', () => {
  test(
    'the password confirms the deletion and the account is gone',
    { tag: '@mobile' },
    async ({ page, accounts, db }) => {
      const account = await accounts.create()
      await signInToPortal(page, account.email, account.password)

      await page.getByRole('button', { name: 'Delete my account' }).click()
      await page.getByLabel('Your password').fill(account.password)
      await page.getByRole('button', { name: 'Delete my account' }).click()

      await expect(page).toHaveURL(portalUrl('/'))
      await expect(notification(page, 'success', 'Your account has been deleted.')).toBeVisible()
      // The 204 cleared the session cookies, and the portal shows nobody signed in.
      expect(
        (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('opos_portal_')),
      ).toEqual([])
      await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
      expect(await accountIds(db, [account.email])).toEqual([])
      expect((await passwordGrant(account.email, account.password)).status).toBe(400)
    },
  )

  test("a convention's last head organizer is told to hand the role over first", async ({
    page,
    accounts,
    tenants,
    db,
  }) => {
    const head = await accounts.create()
    await tenants.create({ headEmail: head.email })
    await signInToPortal(page, head.email, head.password)

    await page.getByRole('button', { name: 'Delete my account' }).click()
    await page.getByLabel('Your password').fill(head.password)
    await page.getByRole('button', { name: 'Delete my account' }).click()

    await expect(page.getByRole('alert')).toContainText(
      'You are the last head organizer of a convention',
    )
    await expect(
      notification(page, 'warning', 'A convention must keep at least one head organizer.'),
    ).toBeVisible()
    await expect(page).toHaveURL(portalUrl('/account'))
    expect(await accountIds(db, [head.email])).toEqual([head.id])
  })
})
