import { expect, test } from '../fixtures'
import { waitForMail } from '../fixtures/mailpit'
import { stack } from '../fixtures/stack'
import { panelUrl, signInToPanel } from '../fixtures/ui'

// The convention's team in the panel (PLAN.md 8): invitations of confirmed accounts, changes,
// removal, and the anti-escalation refusals shown next to the form that caused them
// (PRODUCT.md 5.6).

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

    await signInToPanel(page, head.email, head.password)
    await page.goto(panelUrl(`/${tenant.slug}/team`))

    const invite = page.getByRole('region', { name: 'Invite to the team' })
    await invite.getByLabel('Email').fill(colleague.email)
    await invite.getByLabel('Settings').selectOption('read')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(invite.getByRole('status')).toHaveText(
      'Celina Colleague has joined the team and has been told by email.',
    )
    // The notification links to the convention in the panel (PLAN.md 7.7).
    expect((await waitForMail(colleague.email)).Text).toContain(`${stack.panel}/${tenant.slug}`)

    // Nobody edits their own membership.
    const own = page.getByRole('listitem').filter({ hasText: head.email })
    await expect(own.getByText('(you)')).toBeVisible()
    await expect(own.getByRole('button', { name: 'Edit' })).toHaveCount(0)

    const row = page.getByRole('listitem').filter({ hasText: colleague.email })
    await expect(row.getByRole('definition').filter({ hasText: 'Read' })).toBeVisible()
    await row.getByRole('button', { name: 'Edit' }).click()
    await row.getByLabel('Settings').selectOption('write')
    await row.getByRole('button', { name: 'Save' }).click()
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(row.getByRole('definition').filter({ hasText: 'Write' })).toBeVisible()
    expect(await tenants.membership(tenant.id, colleague.id)).toMatchObject({
      settingsAccess: 'write',
    })

    await row.getByRole('button', { name: 'Remove from the team' }).click()
    await row.getByRole('button', { name: 'Yes, remove Celina Colleague from the team' }).click()
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

    await signInToPanel(page, org.email, org.password)
    await page.goto(panelUrl(`/${tenant.slug}/team`))

    // The org holds no shop permission, so it grants none.
    const invite = page.getByRole('region', { name: 'Invite to the team' })
    await expect(invite.getByLabel('Role').getByRole('option')).toHaveText(['Organizer'])
    await invite.getByLabel('Email').fill(newcomer.email)
    await invite.getByLabel('Shop').selectOption('write')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(invite.getByRole('alert')).toHaveText(
      'You cannot grant permissions higher than your own.',
    )
    expect(await tenants.membership(tenant.id, newcomer.id)).toBeUndefined()

    const row = page.getByRole('listitem').filter({ hasText: member.email })
    await row.getByRole('button', { name: 'Edit' }).click()
    await row.getByLabel('Shop').selectOption('write')
    await row.getByRole('button', { name: 'Save' }).click()
    await expect(row.getByRole('alert')).toHaveText(
      'You cannot grant permissions higher than your own.',
    )

    // A head and the org's own membership offer no change at all.
    for (const email of [head.email, org.email]) {
      const untouchable = page.getByRole('listitem').filter({ hasText: email })
      await expect(untouchable).toBeVisible()
      await expect(untouchable.getByRole('button', { name: 'Edit' })).toHaveCount(0)
      await expect(untouchable.getByRole('button', { name: 'Remove from the team' })).toHaveCount(0)
    }
  })
})
