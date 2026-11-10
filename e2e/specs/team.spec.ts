import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { notification, panelUrl, signInToPanel } from '../fixtures/ui'

// The convention's team in the panel: the table of members, the invitation and the member's
// page with its change and removal, each outcome a notification, and the anti-escalation refusals
// as warnings (PRODUCT.md 5). The team's rows are looked up in the page: the account at the foot
// of the sidebar holds the signed-in address too.

/** The member's row in the team table; its cells are the role, settings, shop and expiry. */
const memberRow = (page: Page, email: string) =>
  page.getByRole('main').getByRole('row').filter({ hasText: email })

test.describe('team management in the panel', () => {
  test('a head adds a confirmed account, changes its permissions and removes it', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create({ metadata: { first_name: 'Hanna', last_name: 'Head' } })
    const tenant = await tenants.create({ headEmail: head.email })
    const colleague = await accounts.create({
      metadata: { first_name: 'Celina', last_name: 'Colleague' },
    })
    const team = panelUrl(`/${tenant.slug}/settings/team`)

    await signInToPanel(page, head.email, head.password)
    await page.goto(team)
    await page.getByRole('link', { name: 'Invite to the team' }).click()
    await expect(page).toHaveURL(`${team}/invite`)

    const invite = page.getByRole('region', { name: 'Invitation' })
    await invite.getByLabel('Email').fill(colleague.email)
    await invite.getByLabel('Settings').selectOption('read')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(
      notification(
        page,
        'success',
        'Added to the team: Celina Colleague. They have been told by email.',
      ),
    ).toBeVisible()
    // The notification links to the convention in the panel.
    expect((await waitForMail(colleague.email)).Text).toContain(`${stack.panel}/${tenant.slug}`)
    await page.getByRole('link', { name: 'Back to the team' }).click()

    // Nobody edits their own membership.
    const own = memberRow(page, head.email)
    await expect(own.getByText('(you)')).toBeVisible()
    await expect(own.getByRole('link')).toHaveCount(0)

    const row = memberRow(page, colleague.email)
    await expect(row.getByRole('cell')).toHaveText([
      'Organizer',
      'Read',
      'No access',
      'No end date',
    ])
    // The whole row opens the member's page, not only the name.
    await row.getByRole('cell', { name: 'Organizer' }).click()
    const membership = page.getByRole('region', { name: 'Membership' })
    await membership.getByLabel('Settings').selectOption('write')
    await membership.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(team)
    await expect(
      notification(page, 'success', 'The membership is saved: Celina Colleague.'),
    ).toBeVisible()
    await expect(row.getByRole('cell').nth(1)).toHaveText('Write')
    expect(await tenants.membership(tenant.id, colleague.id)).toMatchObject({
      settingsAccess: 'write',
    })

    await row.getByRole('link', { name: 'Celina Colleague' }).click()
    const removal = page.getByRole('region', { name: 'Remove from the team' })
    await removal.getByRole('button', { name: 'Remove from the team' }).click()
    const confirm = page.getByRole('alertdialog', {
      name: 'Remove Celina Colleague from the team?',
    })
    await expect(confirm).toContainText('This action cannot be undone.')
    await confirm.getByRole('button', { name: 'Remove from the team' }).click()
    await expect(page).toHaveURL(team)
    await expect(
      notification(page, 'success', 'Removed from the team: Celina Colleague.'),
    ).toBeVisible()
    await expect(row).toHaveCount(0)
    expect(await tenants.membership(tenant.id, colleague.id)).toBeUndefined()
  })

  test('an org cannot grant more than it holds, and leaves heads and itself alone', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const org = await accounts.create()
    await tenants.addOrg(tenant.id, org.id, { settings: 'write' })
    const member = await accounts.create()
    await tenants.addOrg(tenant.id, member.id)
    const newcomer = await accounts.create()
    const team = panelUrl(`/${tenant.slug}/settings/team`)

    await signInToPanel(page, org.email, org.password)
    await page.goto(`${team}/invite`)

    // The org holds no shop permission, so it grants none.
    const invite = page.getByRole('region', { name: 'Invitation' })
    await expect(invite.getByLabel('Role').getByRole('option')).toHaveText(['Organizer'])
    await invite.getByLabel('Email').fill(newcomer.email)
    await invite.getByLabel('Shop').selectOption('write')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(
      notification(page, 'warning', 'You cannot grant permissions higher than your own.'),
    ).toBeVisible()
    expect(await tenants.membership(tenant.id, newcomer.id)).toBeUndefined()

    await page.goto(team)
    await memberRow(page, member.email).getByRole('link').click()
    const membership = page.getByRole('region', { name: 'Membership' })
    await membership.getByLabel('Shop').selectOption('write')
    await membership.getByRole('button', { name: 'Save' }).click()
    await expect(
      notification(page, 'warning', 'You cannot grant permissions higher than your own.'),
    ).toBeVisible()

    // A head and the org's own membership lead to no page of change.
    await page.getByRole('link', { name: 'Back to the team' }).click()
    for (const email of [head.email, org.email]) {
      const untouchable = memberRow(page, email)
      await expect(untouchable).toBeVisible()
      await expect(untouchable.getByRole('link')).toHaveCount(0)
    }
  })
})
