import { passwordGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { accountIds } from '../fixtures/tenants'
import { portalUrl, signInToPortal } from '../fixtures/ui'

// PLAN.md 15.2, scenario 9 (the account deletion): DELETE /me after the password confirms it is
// the account's owner (PLAN.md 9, Account deletion).

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
      await expect(page.getByRole('status')).toHaveText('Your account has been deleted.')
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
    await expect(page).toHaveURL(portalUrl('/account'))
    expect(await accountIds(db, [head.email])).toEqual([head.id])
  })
})
