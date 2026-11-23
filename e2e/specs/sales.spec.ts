import { readFile } from 'node:fs/promises'
import { expect, test } from '../fixtures'
import { buy, pay, selling } from '../fixtures/buying'
import { followFolderLink, panelUrl, signInToPanel } from '../fixtures/ui'

// The reports of an edition's sales (docs/specs/0010-sales-reports.md, e2e): the dashboard as the
// orders are, and a list taken away as a file.

test('an org opens the sales after two orders and downloads the ticket holder list', async ({
  page,
  request,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const [paid, waiting] = [accounts.freshEmail('paid'), accounts.freshEmail('waiting')]
  await pay(request, await buy(request, s, { email: paid, shirt: true }))
  await buy(request, s, { email: waiting })

  await signInToPanel(page, s.head.email, s.head.password)
  await followFolderLink(page.getByRole('navigation', { name: s.edition.name }), 'Shop', 'Sales')
  await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toBeVisible()

  // One order is paid, a ticket with a T-shirt; the other still awaits its payment.
  const revenue = page.getByRole('region', { name: 'Revenue' })
  await expect(revenue.getByRole('row', { name: /Paid in the shop/ })).toContainText('200.00')
  await expect(revenue.getByRole('row', { name: /Awaiting payment/ })).toContainText('1')
  // The paid order is drawn on the day it was paid: the revenue and the tickets so far, and the
  // same day as a row of the table under the charts.
  const overTime = page.getByRole('region', { name: 'Sales over time' })
  await expect(overTime.getByRole('figure', { name: 'Revenue so far' })).toBeVisible()
  await expect(overTime.getByRole('figure', { name: 'Tickets sold so far' })).toBeVisible()
  await overTime.getByText('The days as a table').click()
  await expect(
    overTime.getByRole('table', { name: 'What was sold on each day' }).getByRole('row'),
  ).toHaveCount(2)
  const tickets = page.getByRole('region', { name: 'Tickets' })
  await expect(tickets.getByRole('row', { name: /Standard/ }).getByRole('cell')).toHaveText([
    '1',
    '1',
  ])
  const merchandise = page.getByRole('region', { name: 'Merchandise' })
  await expect(
    merchandise.getByRole('row', { name: /T-shirt \(M\)/ }).getByRole('cell'),
  ).toHaveText(['1', '0'])

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('region', { name: 'Lists to download' })
      .getByRole('button', { name: 'Ticket holders' })
      .click(),
  ])
  expect(download.suggestedFilename()).toBe(`ticket-holders-${s.edition.slug}.csv`)
  const file = await readFile(await download.path(), 'utf8')
  const rows = file.trim().split('\r\n')
  expect(rows[0]).toContain('"Order number";"Status";"Ticket holder"')
  expect(rows).toHaveLength(3)
  expect(file).toContain(`"Paid";"Ada Lovelace";"Adult";"Standard"`)
  expect(file).toContain(paid)
  expect(file).toContain(`"Awaiting payment"`)
})

test('an org without the tickets permission of the edition sees neither the sales nor the lists', async ({
  page,
  accounts,
  tenants,
}) => {
  const s = await selling(tenants, accounts)
  const org = await accounts.create()
  const orgId = await tenants.addOrg(s.tenant.id, org.id)
  await tenants.addEditionAccess(s.tenant.id, orgId, s.edition.id, { program: 'write' })

  await signInToPanel(page, org.email, org.password)
  await expect(
    page.getByRole('navigation', { name: s.edition.name }).getByRole('link', { name: 'Programme' }),
  ).toBeVisible()
  // The folder of the shop, which holds the sales, is not in the menu at all.
  await expect(
    page.getByRole('navigation', { name: s.edition.name }).getByRole('button', { name: 'Shop' }),
  ).toHaveCount(0)

  // Around the menu, the page shows nothing and offers no list.
  await page.goto(panelUrl(`/${s.tenant.slug}/editions/${s.edition.slug}/sales`))
  await expect(page.getByRole('heading', { name: 'No permissions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ticket holders' })).toBeHidden()
})
