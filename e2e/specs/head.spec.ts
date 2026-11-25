import { expect, test } from '../fixtures'
import { portalUrl } from '../fixtures/ui'

// The head of a page's document (docs/ARCHITECTURE.md, Frontends): what a search engine and the
// preview of a shared link read without running the portal. The dev server fills it as a
// deployment's server does, from the API under test, but answers every page with 200.

test('a link to an edition says what the edition is before the portal runs', async ({
  request,
  accounts,
  tenants,
}) => {
  const head = await accounts.create()
  const tenant = await tenants.create({
    headEmail: head.email,
    timezone: 'Europe/Warsaw',
    defaultLocale: 'en',
  })
  const edition = await tenants.addEdition(tenant.id, {
    name: `Spring ${tenant.slug}`,
    startsInDays: 10,
    isPublished: true,
    venue: { name: 'Congress Hall', address: '1 Main St', city: 'Poznań' },
  })
  const address = portalUrl(`/conventions/${tenant.slug}/${edition.slug}`)

  const html = await (await request.get(`${address}?shared=1`)).text()

  expect(html).toContain('<html lang="en">')
  expect(html).toContain(`<title>${edition.name} · OPOS</title>`)
  expect(html).toContain(`<meta property="og:title" content="${edition.name}" data-server-head>`)
  expect(html).toMatch(
    /<meta name="description" content="[^"]+ · Congress Hall, 1 Main St, Poznań" data-server-head>/,
  )
  // The page's own address, without what the link carried after it
  expect(html).toContain(`<link rel="canonical" href="${address}" data-server-head>`)
  expect(html).toContain(`<meta property="og:url" content="${address}" data-server-head>`)
})

test('a link to a convention that is not there asks search engines to leave it out', async ({
  request,
}) => {
  const html = await (await request.get(portalUrl('/conventions/e2e-not-there'))).text()

  expect(html).toContain('<meta name="robots" content="noindex" data-server-head>')
  expect(html).not.toContain('rel="canonical"')
})

test(
  'the head a page was opened with goes once the visitor moves to another page',
  { tag: '@mobile' },
  async ({ page, accounts, tenants }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
    const edition = await tenants.addEdition(tenant.id, {
      name: `Autumn ${tenant.slug}`,
      startsInDays: 10,
      isPublished: true,
    })
    const address = portalUrl(`/conventions/${tenant.slug}/${edition.slug}`)
    const canonical = page.locator('link[rel="canonical"]')

    await page.goto(address)
    await expect(page.getByRole('heading', { name: edition.name, level: 1 })).toBeVisible()
    await expect(canonical).toHaveAttribute('href', address)

    // A browser that shares the page reads its address from the head: none may name the page left
    await page.getByRole('link', { name: 'See the programme' }).click()
    await expect(page).toHaveURL(`${address}/program`)
    await expect(page).toHaveTitle(`Programme · ${edition.name} · OPOS`)
    await expect(page.locator('[data-server-head]')).toHaveCount(0)
  },
)
