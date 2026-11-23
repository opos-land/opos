import { accessToken, callApi } from '../fixtures/api'
import { expect, test } from '../fixtures'
import { openPanelSwitcher, panelUrl, signInToPanel, switchPanelArea } from '../fixtures/ui'

// What the panel shows follows the member's permissions, and the API refuses what the UI hides.

test.describe('permissions in the panel', () => {
  test('an org without settings works in its edition alone, and entering the settings by URL is refused', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const edition = await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    const org = await accounts.create()
    const membership = await tenants.addOrg(tenant.id, org.id)
    await tenants.addEditionAccess(tenant.id, membership, edition.id, { program: 'read' })

    await signInToPanel(page, org.email, org.password)
    // The org lands in its only edition, whose menu holds the programme alone.
    await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
    const editionMenu = page.getByRole('navigation', { name: edition.name })
    await expect(editionMenu.getByRole('link')).toHaveText(['Dashboard', 'Programme'])
    await openPanelSwitcher(page)
    await expect(page.getByRole('menuitem')).toHaveText([edition.name])
    await page.keyboard.press('Escape')

    for (const path of [
      'settings',
      'settings/editions',
      'settings/editions/new',
      'settings/team',
      'settings/team/invite',
      `editions/${edition.slug}/access`,
      `editions/${edition.slug}/settings`,
    ]) {
      await page.goto(panelUrl(`/${tenant.slug}/${path}`))
      await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
    }
  })

  test('an org with settings=read sees the team and the settings, and changes nothing', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const edition = await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    const org = await accounts.create()
    await tenants.addOrg(tenant.id, org.id, { settings: 'read' })

    await signInToPanel(page, org.email, org.password)
    // Reading the settings, the org sees every edition, with its access and settings.
    const editionMenu = page.getByRole('navigation', { name: edition.name })
    await expect(editionMenu.getByRole('link')).toHaveText([
      'Dashboard',
      'Access',
      'Edition settings',
    ])
    await editionMenu.getByRole('link', { name: 'Edition settings' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Activate' })).toHaveCount(0)

    await switchPanelArea(page, 'Convention settings')
    const settings = page.getByRole('navigation', { name: tenant.name })
    await settings.getByRole('link', { name: 'Team' }).click()
    const members = page.getByRole('region', { name: 'Members' })
    await expect(members.getByRole('row').filter({ hasText: head.email })).toBeVisible()
    // No member's page and no invitation: reading the team is all.
    await expect(members.getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Invite to the team' })).toHaveCount(0)

    await settings.getByRole('link', { name: 'General' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // Each scenario makes its own conventions and accounts: a demo account of the seed reads the
  // panel in the language the seed gives it, which these scenarios do not depend on.
  test("another tenant's convention is closed in the UI and in the API", async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const own = await tenants.create({ headEmail: head.email })
    const otherHead = await accounts.create()
    const other = await tenants.create({ headEmail: otherHead.email })
    const foreign = await tenants.addEdition(other.id)

    await signInToPanel(page, head.email, head.password)
    for (const path of ['', '/settings', `/editions/${foreign.slug}`]) {
      await page.goto(panelUrl(`/${other.slug}${path}`))
      await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
    }

    const token = await accessToken(head.email, head.password)
    const refused = await callApi('/tenants/current', { token, tenantSlug: other.slug })
    expect(refused.status).toBe(403)
    // An edition of the other convention is not found under the member's own.
    const crossed = await callApi(`/editions/${foreign.id}`, { token, tenantSlug: own.slug })
    expect(crossed.status).toBe(404)
  })

  test('an org whose membership has expired sees no convention', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const org = await accounts.create()
    await tenants.addOrg(tenant.id, org.id, { expired: true })

    await signInToPanel(page, org.email, org.password)
    await expect(page.getByRole('heading', { name: 'Your conventions' })).toBeVisible()
    await expect(page.getByText("You are not in any convention's team.")).toBeVisible()

    await page.goto(panelUrl(`/${tenant.slug}`))
    await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
  })
})
