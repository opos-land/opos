import { sql } from 'drizzle-orm'
import { accessToken, callApi } from '../fixtures/api'
import { expect, test } from '../fixtures'
import { panelUrl, seeded, signInToPanel } from '../fixtures/ui'

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
    await expect(page.getByRole('link', { name: 'Convention settings' })).toHaveCount(0)

    for (const path of [
      'settings',
      'settings/editions',
      'settings/team',
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

    await page.getByRole('link', { name: 'Convention settings' }).click()
    const settings = page.getByRole('navigation', { name: tenant.name })
    await settings.getByRole('link', { name: 'Team' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: head.email })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Invite to the team' })).toHaveCount(0)

    await settings.getByRole('link', { name: 'General' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test("another tenant's convention is closed in the UI and in the API", async ({ page, db }) => {
    await signInToPanel(page, seeded.headA, seeded.password)
    await page.goto(panelUrl('/convention-b'))
    await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
    await page.goto(panelUrl('/convention-b/settings'))
    await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
    await page.goto(panelUrl('/convention-b/editions/2026'))
    await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()

    const token = await accessToken(seeded.headA, seeded.password)
    const foreign = await callApi('/tenants/current', { token, tenantSlug: 'convention-b' })
    expect(foreign.status).toBe(403)

    const [editionB] = await db.execute<{ id: string }>(sql`
      select e.id from editions e join tenants t on t.id = e.tenant_id
      where t.slug = 'convention-b' limit 1
    `)
    expect(editionB).toBeDefined()
    const crossed = await callApi(`/editions/${editionB!.id}`, {
      token,
      tenantSlug: 'convention-a',
    })
    expect(crossed.status).toBe(404)
  })

  test('an org whose membership has expired sees no convention', async ({ page }) => {
    await signInToPanel(page, seeded.expiredA, seeded.password)
    await expect(page.getByRole('heading', { name: 'Your conventions' })).toBeVisible()
    await expect(page.getByText("You are not in any convention's team.")).toBeVisible()

    await page.goto(panelUrl('/convention-a'))
    await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
  })
})
