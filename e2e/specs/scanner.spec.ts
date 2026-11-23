import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { buy, pay, selling } from '../fixtures/buying'
import { waitForMail } from '../fixtures/mailpit'
import { notification, panelUrl, signInToPanel } from '../fixtures/ui'

// The scanner (docs/specs/0007-scanner.md): an org enables one in the panel, a phone pairs with
// its code and reads buyers' QR codes with no account signed in. The scenario types each code as
// a person reads it out at the desk: the camera's reader is the same read behind another input.

/** The QR code of an order, as its buyer holds it: from the confirmation email. */
async function qrCodeOf(email: string) {
  const mail = await waitForMail(email, 1, 60_000)
  const code = /The QR code of the order \S+: ([A-Z2-7]{32})/.exec(mail.Text)?.[1]
  if (!code) throw new Error(`no QR code in "${mail.Subject}"`)
  return code
}

/** Types a code on the scanner and reads it. */
async function read(phone: Page, code: string) {
  await phone.getByLabel('QR code').fill(code)
  await phone.getByRole('button', { name: 'Read the code' }).click()
}

test(
  'an org enables a scanner, a phone pairs with its code, reads a QR code and hands out',
  { tag: '@mobile' },
  async ({ page, browser, request, accounts, tenants }) => {
    test.slow()
    const s = await selling(tenants, accounts)
    const [buyer, other] = [accounts.freshEmail('buyer'), accounts.freshEmail('other')]
    const order = await buy(request, s, { email: buyer, shirt: true })
    await pay(request, order)
    const canceled = await buy(request, s, { email: other })
    await pay(request, canceled)
    const [code, canceledCode] = [await qrCodeOf(buyer), await qrCodeOf(other)]
    await tenants.cancelOrder(canceled.orderId)

    // The org enables a scanner and is shown its pairing code, once.
    await signInToPanel(page, s.head.email, s.head.password)
    await page.goto(panelUrl(`/${s.tenant.slug}/editions/${s.edition.slug}/scanners`))
    await expect(page.getByText('The edition has no scanners yet.')).toBeVisible()
    // A scanner is enabled on a page of its own, which then shows the code.
    await page.getByRole('link', { name: 'Enable a scanner' }).click()
    await page.getByLabel('Name of the scanner').fill('Main gate')
    await page.getByRole('button', { name: 'Enable the scanner' }).click()
    await expect(
      notification(page, 'success', 'The scanner is enabled. Pair a phone with its code now.'),
    ).toBeVisible()
    await expect(page.getByRole('img', { name: /QR code that pairs a phone/ })).toBeVisible()
    const link = await page.getByText(/\/scanner#[A-Za-z0-9_-]{43}$/).textContent()
    await page.getByRole('link', { name: 'All scanners' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Main gate' })).toContainText(
      'Waiting for a phone',
    )

    // A phone with no account signed in opens the link and becomes the scanner.
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } })
    const phone = await context.newPage()
    await phone.goto(link!)
    await expect(phone.getByRole('heading', { name: 'Main gate', level: 1 })).toBeVisible()
    await expect(phone.getByText(`Scanner of ${s.edition.name}`)).toBeVisible()
    expect(new URL(phone.url()).hash).toBe('')
    // The code is spent: a second phone that opens the link is none.
    const another = await browser.newContext({ viewport: { width: 360, height: 800 } })
    const second = await another.newPage()
    await second.goto(link!)
    await expect(second.getByText(/pairing code does not work/)).toBeVisible()
    await another.close()

    // It reads a paid order's QR code, and the org hands out entry and the T-shirt.
    await read(phone, code)
    await expect(phone.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible()
    await expect(phone.getByText('Standard', { exact: true })).toBeVisible()
    await phone.getByRole('checkbox', { name: 'Entry' }).click()
    await phone.getByRole('checkbox', { name: /T-shirt \(M\)/ }).click()
    await phone.getByRole('button', { name: 'Mark as handed out' }).click()
    await expect(phone.getByText(/Handed out .+ by Main gate/)).toHaveCount(2)

    // A second scan shows both as handed out, and offers nothing to mark.
    await phone.getByRole('button', { name: 'Read the next code' }).click()
    await read(phone, code)
    await expect(phone.getByText(/Handed out .+ by Main gate/)).toHaveCount(2)
    await expect(phone.getByRole('button', { name: 'Mark as handed out' })).toBeHidden()

    // A canceled order's code is "Not valid".
    await phone.getByRole('button', { name: 'Read the next code' }).click()
    await read(phone, canceledCode)
    await expect(phone.getByRole('alert')).toContainText('Not valid')
    await expect(phone.getByRole('alert')).toContainText('The order was canceled.')

    // The scanner has a page of its own in the panel: what it handed out, with the order it marked.
    await page.reload()
    const listed = page.getByRole('row').filter({ hasText: 'Main gate' })
    await expect(listed).toContainText('Paired with a phone')
    await listed.getByRole('link', { name: 'Main gate' }).click()
    await expect(page.getByRole('heading', { name: 'Main gate', level: 1 })).toBeVisible()
    const handOuts = page.getByRole('region', { name: 'Hand-outs' })
    await expect(handOuts.getByRole('row', { name: /Entries and items/ }).first()).toContainText(
      '2',
    )
    await expect(handOuts.getByRole('link', { name: order.number })).toBeVisible()

    // A new pairing code, shown once, takes the scanner from the phone that held it.
    await page.getByRole('button', { name: 'New pairing code' }).click()
    const again = page.getByRole('alertdialog')
    await expect(again).toContainText('Pair another phone with Main gate?')
    await again.getByRole('button', { name: 'Pair another phone' }).click()
    await expect(page.getByText(/\/scanner#[A-Za-z0-9_-]{43}$/)).toBeVisible()
    await phone.getByRole('button', { name: 'Read the next code' }).click()
    await read(phone, code)
    await expect(phone.getByText(/This scanner no longer works/)).toBeVisible()

    // Revoked on its page, the scanner takes no phone again.
    await page.getByRole('button', { name: 'Revoke the scanner' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Revoke the scanner Main gate?')
    await dialog.getByRole('button', { name: 'Revoke the scanner' }).click()
    await expect(notification(page, 'success', 'The scanner is revoked.')).toBeVisible()
    await expect(page.getByText(/gets no new pairing code/)).toBeVisible()
    await context.close()
  },
)
