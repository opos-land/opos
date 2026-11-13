import { randomUUID } from 'node:crypto'
import { deleteTenant, suspendTenant } from '@opos/db'
import { type Page } from '@playwright/test'
import { type AccountWithTwoFactor, expect, test } from '../fixtures'
import { removeFactors } from '../fixtures/auth-admin'
import { turnOnTwoFactor } from '../fixtures/two-factor'
import {
  adminUrl,
  codeFor,
  notification,
  panelUrl,
  portalUrl,
  signInToAdmin,
  signInToPanel,
  signInToPortal,
} from '../fixtures/ui'

// The admin application (docs/specs/platform-administration.md): an admin signs in with a
// password and a code and runs the conventions from it. Every scenario makes its own admin,
// accounts and conventions, and only reads the seed.

const freshSlug = () => `e2e-${randomUUID().slice(0, 8)}`

/** Opens a convention's page from the list. */
async function openConvention(page: Page, name: string) {
  await page.goto(adminUrl('/'))
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

/** The password and nothing else: an account without a second factor is asked for no code. */
async function signInWithPasswordAlone(page: Page, account: { email: string; password: string }) {
  await page.goto(adminUrl('/login'))
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test.describe('signing in to the admin application', () => {
  test('an admin signs in with password and code and sees the conventions; a wrong code is refused', async ({
    page,
    admins,
  }) => {
    const admin = await admins.create()

    await page.goto(adminUrl('/'))
    await expect(page).toHaveURL(adminUrl('/login'))
    await page.getByLabel('Email', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill(admin.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible()
    // Nothing of the platform shows before the code.
    await expect(page.getByRole('link', { name: 'Convention A', exact: true })).toBeHidden()
    await page.getByLabel('Code', { exact: true }).fill('000000')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toContainText('The code is wrong')

    await page.getByLabel('Code', { exact: true }).fill(codeFor(admin.secret))
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Conventions', level: 1 })).toBeVisible()
    // The seed's conventions, the suspended one marked.
    await expect(page.getByRole('link', { name: 'Convention A', exact: true })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'convention-c' })).toContainText(
      'Suspended',
    )
  })

  test('the sign-in page offers no sign-up, no Google and no password reset', async ({ page }) => {
    await page.goto(adminUrl('/login'))

    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('link')).toHaveCount(0)
    await expect(page.getByText(/google|forgot/i)).toHaveCount(0)
  })

  test('an account that is no admin sees that it is none, and no convention', async ({
    page,
    admins,
  }) => {
    const account = await admins.withTwoFactor()

    await signInToAdmin(page, account)

    await expect(
      page.getByRole('heading', { name: 'This account does not hold the administrator role' }),
    ).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Log', exact: true })).toHaveCount(0)
    await page.goto(adminUrl('/log'))
    await expect(
      page.getByRole('heading', { name: 'This account does not hold the administrator role' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('an admin who turned two-factor authentication off turns it on, asks for a new grant and gets in', async ({
    page,
    admins,
  }) => {
    const admin = await admins.create()
    await removeFactors(admin.id)

    await signInWithPasswordAlone(page, admin)
    await expect(
      page.getByRole('heading', { name: 'Two-factor authentication is off' }),
    ).toBeVisible()
    await expect(page.getByText('Turn it on in the portal')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)

    // Turned on again in the portal: another factor than the one the role was granted with.
    const again: AccountWithTwoFactor = { ...admin, secret: await turnOnTwoFactor(admin) }
    await signInToAdmin(page, again)
    await expect(
      page.getByRole('heading', { name: 'The administrator role has to be granted again' }),
    ).toBeVisible()

    await admins.grant(admin.email)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Conventions', level: 1 })).toBeVisible()
  })

  test('an admin session is no panel session, and signing out of one leaves the other', async ({
    page,
    context,
    admins,
  }) => {
    const admin = await admins.create()
    await signInToAdmin(page, admin)
    await expect(page.getByRole('heading', { name: 'Conventions', level: 1 })).toBeVisible()

    // The same browser, the same account: the panel knows nothing of the admin session.
    const panel = await context.newPage()
    await panel.goto(panelUrl('/'))
    await expect(panel).toHaveURL(/\/login/)
    await panel.getByLabel('Email', { exact: true }).fill(admin.email)
    await panel.getByLabel('Password', { exact: true }).fill(admin.password)
    await panel.getByRole('button', { name: 'Sign in', exact: true }).click()
    await panel.getByLabel('Code', { exact: true }).fill(codeFor(admin.secret))
    await panel.getByRole('button', { name: 'Continue' }).click()
    await expect(panel.getByRole('heading', { name: 'Your conventions' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)

    await panel.reload()
    await expect(panel.getByRole('heading', { name: 'Your conventions' })).toBeVisible()
    await page.goto(adminUrl('/'))
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('conventions in the admin application', () => {
  test('the admin creates a convention with a confirmed account as its first head, who opens it in the panel', async ({
    page,
    context,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const slug = freshSlug()
    const name = `Created ${slug}`
    await signInToAdmin(page, admin)

    await page.getByRole('link', { name: 'New convention' }).click()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Address', { exact: true }).fill(slug)
    await page.getByLabel('Convention language').selectOption('en')
    await page.getByLabel('Email address of the first head organizer').fill(head.email)
    await page.getByRole('button', { name: 'Create the convention' }).click()

    await expect(notification(page, 'success', `The convention ${name} is created.`)).toBeVisible()
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(page.getByText(head.email)).toBeVisible()
    tenants.track(new URL(page.url()).pathname.split('/').at(-1)!)

    const panel = await context.newPage()
    await signInToPanel(panel, head.email, head.password)
    await expect(panel).toHaveURL(new RegExp(`/${slug}(/|$)`))
    await expect(panel.getByText(name).first()).toBeVisible()
  })

  test('an unknown or unconfirmed address, a taken or reserved address and the address of a deleted convention create nothing', async ({
    page,
    db,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const unconfirmed = await accounts.create({ confirmed: false })
    const taken = await tenants.create({ headEmail: head.email })
    const gone = await tenants.create({ headEmail: head.email })
    await suspendTenant(db, gone.id)
    await deleteTenant(db, gone.id)
    const name = `Never ${freshSlug()}`
    await signInToAdmin(page, admin)
    await page.goto(adminUrl('/conventions/new'))

    const attempt = async (slug: string, email: string, refusal: string) => {
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByLabel('Address', { exact: true }).fill(slug)
      await page.getByLabel('Email address of the first head organizer').fill(email)
      await page.getByRole('button', { name: 'Create the convention' }).click()
      await expect(notification(page, 'warning', refusal)).toBeVisible()
      await expect(page).toHaveURL(adminUrl('/conventions/new'))
    }
    await attempt(freshSlug(), accounts.freshEmail('nobody'), 'No account uses this email address.')
    await attempt(freshSlug(), unconfirmed.email, 'has not been confirmed yet')
    await attempt(taken.slug, head.email, 'already taken by another convention')
    await attempt('panel', head.email, 'reserved for the platform')
    await attempt(gone.slug, head.email, 'belonged to a deleted convention')

    await page.goto(adminUrl('/'))
    await expect(page.getByRole('heading', { name: 'Conventions', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
  })

  test('a changed address answers at once, and the old one is not found', async ({
    page,
    context,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const next = freshSlug()
    await signInToAdmin(page, admin)
    await openConvention(page, tenant.name)

    const address = page.getByRole('textbox', { name: 'Address', exact: true })
    await expect(address).toHaveValue(tenant.slug)
    await address.fill(next)
    await page.getByRole('button', { name: 'Change the address' }).click()
    await expect(notification(page, 'success', 'The address is changed.')).toBeVisible()

    const portal = await context.newPage()
    await portal.goto(portalUrl(`/conventions/${next}`))
    await expect(portal.getByRole('heading', { name: tenant.name, level: 1 })).toBeVisible()
    await portal.goto(portalUrl(`/conventions/${tenant.slug}`))
    await expect(portal.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('a suspended convention is off in the portal and the panel, and back once restored', async ({
    page,
    context,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    // A second convention of the same head, so the panel lists them.
    const other = await tenants.create({ headEmail: head.email })
    await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })

    const panel = await context.newPage()
    await signInToPanel(panel, head.email, head.password)
    await panel.goto(panelUrl(`/${tenant.slug}/settings`))
    await expect(panel.getByRole('heading', { name: 'General', level: 1 })).toBeVisible()

    await signInToAdmin(page, admin)
    await openConvention(page, tenant.name)
    await page.getByRole('button', { name: 'Suspend the convention' }).click()
    await expect(notification(page, 'success', 'The convention is suspended.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore the convention' })).toBeVisible()

    // The portal: as an address nobody has.
    const portal = await context.newPage()
    await portal.goto(portalUrl(`/conventions/${tenant.slug}`))
    await expect(portal.getByRole('heading', { name: 'Page not found' })).toBeVisible()

    // The panel: the next action of the open page is refused, and the page gives way.
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(notification(panel, 'warning', 'This convention is suspended.')).toBeVisible()
    await expect(
      panel.getByRole('heading', { name: 'This convention is suspended', level: 1 }),
    ).toBeVisible()
    // Where the conventions are listed, and inside it on a fresh load.
    await panel.goto(panelUrl('/'))
    const card = panel.getByRole('listitem').filter({ hasText: tenant.name })
    await expect(card).toContainText('Suspended')
    await expect(panel.getByRole('listitem').filter({ hasText: other.name })).not.toContainText(
      'Suspended',
    )
    await panel.goto(panelUrl(`/${tenant.slug}/settings`))
    await expect(
      panel.getByRole('heading', { name: 'This convention is suspended', level: 1 }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Restore the convention' }).click()
    await expect(notification(page, 'success', 'The convention is restored.')).toBeVisible()

    await portal.reload()
    await expect(portal.getByRole('heading', { name: tenant.name, level: 1 })).toBeVisible()
    await panel.goto(panelUrl(`/${tenant.slug}/settings`))
    await expect(panel.getByRole('heading', { name: 'General', level: 1 })).toBeVisible()
    await expect(panel.getByLabel('Name', { exact: true })).toHaveValue(tenant.name)
  })

  test('only a suspended convention can be deleted, once its address is typed in, and its head still signs in', async ({
    page,
    context,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    await signInToAdmin(page, admin)
    await openConvention(page, tenant.name)

    await expect(page.getByRole('button', { name: 'Delete the convention' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Suspend the convention' }).click()
    await page.getByRole('button', { name: 'Delete the convention' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(`Delete the convention ${tenant.name}?`)
    await expect(dialog).toContainText('This action cannot be undone.')
    const act = dialog.getByRole('button', { name: 'Delete for good' })
    await expect(act).toBeDisabled()
    await dialog.getByRole('textbox').fill(tenant.name)
    await expect(act).toBeDisabled()
    await dialog.getByRole('textbox').fill(tenant.slug)
    await act.click()

    await expect(
      notification(page, 'success', `The convention ${tenant.name} is deleted.`),
    ).toBeVisible()
    await expect(page).toHaveURL(adminUrl('/'))
    await expect(page.getByRole('link', { name: tenant.name, exact: true })).toHaveCount(0)

    // The account stays: its head signs in, to a panel that lists no convention.
    const panel = await context.newPage()
    await signInToPanel(panel, head.email, head.password)
    await expect(panel.getByText("You are not in any convention's team.")).toBeVisible()
  })

  test('the log lists what the admin did, with the admin and the convention', async ({
    page,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create({ metadata: { first_name: 'Ada', last_name: 'Admin' } })
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    await signInToAdmin(page, admin)
    await openConvention(page, tenant.name)
    await page.getByRole('button', { name: 'Suspend the convention' }).click()
    await expect(notification(page, 'success', 'The convention is suspended.')).toBeVisible()
    await page.getByRole('button', { name: 'Restore the convention' }).click()
    await expect(notification(page, 'success', 'The convention is restored.')).toBeVisible()

    await page.getByRole('link', { name: 'Log', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Log', level: 1 })).toBeVisible()
    const mine = page.getByRole('row').filter({ hasText: tenant.slug })
    await expect(mine).toHaveCount(2)
    await expect(mine.nth(0)).toContainText('Restored the convention')
    await expect(mine.nth(1)).toContainText('Suspended the convention')
    await expect(mine.nth(0)).toContainText(`Ada Admin (${admin.email})`)
    // The grant of this admin's role, which a script made.
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: admin.email })
        .filter({ hasText: 'Granted the administrator role' }),
    ).toContainText('a script on the server')
  })
})

test.describe('accounts in the admin application', () => {
  test('a reset account next signs in to the portal without a code; an unknown address is refused', async ({
    page,
    context,
    accounts,
    admins,
  }) => {
    const admin = await admins.create()
    const person = await admins.withTwoFactor()
    await signInToAdmin(page, admin)
    await page.getByRole('link', { name: 'Two-factor reset', exact: true }).click()

    const reset = async (email: string) => {
      await page.getByLabel('Email address of the account').fill(email)
      await page.getByRole('button', { name: 'Reset two-factor authentication' }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toContainText(`Reset two-factor authentication of ${email}?`)
      await expect(dialog).toContainText('This action cannot be undone.')
      await dialog.getByRole('button', { name: 'Reset', exact: true }).click()
    }
    await reset(accounts.freshEmail('nobody'))
    await expect(notification(page, 'warning', 'No account uses this email address.')).toBeVisible()

    await reset(person.email)
    await expect(
      notification(page, 'success', 'Two-factor authentication of the account is reset'),
    ).toBeVisible()

    const portal = await context.newPage()
    await signInToPortal(portal, person.email, person.password)
    await expect(portal).not.toHaveURL(/\/auth\/mfa/)
  })

  test("an admin's own two-factor authentication is never reset here", async ({ page, admins }) => {
    const [admin, other] = [await admins.create(), await admins.create()]
    await signInToAdmin(page, admin)
    await page.goto(adminUrl('/two-factor-reset'))

    await page.getByLabel('Email address of the account').fill(other.email)
    await page.getByRole('button', { name: 'Reset two-factor authentication' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset', exact: true }).click()

    await expect(
      notification(page, 'warning', 'This account belongs to an administrator.'),
    ).toBeVisible()
  })
})
