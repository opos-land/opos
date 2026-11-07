import { totp } from '@opos/db/totp'
import { type Page } from '@playwright/test'
import { type Accounts, expect, test } from '../fixtures'
import { confirmLinkIn, invitationLinkIn, waitForMail } from '../fixtures/mailpit'
import { accountIds } from '../fixtures/tenants'
import {
  panelUrl,
  portalUrl,
  signInToPanel,
  signInToPortal,
  signOutOfPanel,
  signOutOfPortal,
} from '../fixtures/ui'

// Two-factor authentication through the screens of the portal and the panel. The code of the
// authenticator app is computed from the secret the card shows, with the RFC 6238 function of
// packages/db.

const codeFor = (secret: string) => totp(secret, Date.now())

/** Turns two-factor authentication on from the card of `/account`; the secret and the ten codes. */
async function turnOn(page: Page) {
  // The narrowest phone the portal designs for.
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto(portalUrl('/account'))
  await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click()
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible()
  const secret = (await page.locator('code').textContent()) ?? ''
  expect(secret).toMatch(/^[A-Z2-7]+$/)
  await page.getByLabel('Code from the app').fill(codeFor(secret))
  await page.getByRole('button', { name: 'Turn on', exact: true }).click()

  const items = page.getByRole('listitem').filter({ hasText: /^[A-Z2-7]{16}$/ })
  await expect(items).toHaveCount(10)
  const recoveryCodes = await items.allTextContents()
  // The codes view fits 360 px: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'I have saved my codes' }).click()
  await expect(page.getByText('Two-factor authentication is on.')).toBeVisible()
  return { secret, recoveryCodes }
}

/** An account whose 2FA is on and which is signed out of the portal, as a person who came back. */
async function accountWithTwoFactor(page: Page, accounts: Accounts) {
  const account = await accounts.create()
  await signInToPortal(page, account.email, account.password)
  const factor = await turnOn(page)
  await signOutOfPortal(page)
  return { account, ...factor }
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel('Code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Continue' }).click()
}

test.describe('two-factor authentication', () => {
  test(
    'turned on in the portal, it asks for a code at the next sign-in and refuses a wrong one',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const account = await accounts.create()
      await signInToPortal(page, account.email, account.password)
      const { secret } = await turnOn(page)
      await signOutOfPortal(page)

      await signInToPortal(page, account.email, account.password)
      await expect(page).toHaveURL(portalUrl('/auth/mfa'))
      await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible()

      // No account data is shown to a session that has not given its code.
      await page.goto(portalUrl('/schedule'))
      await expect(page).toHaveURL(portalUrl('/auth/mfa?redirect=%2Fschedule'))

      const right = codeFor(secret)
      await enterCode(page, right === '000000' ? '000001' : '000000')
      await expect(page.getByRole('alert')).toContainText('The code is wrong')
      await expect(page.getByLabel('Code', { exact: true })).toHaveValue(/^\d{6}$/)

      await enterCode(page, codeFor(secret))
      await expect(page).toHaveURL(portalUrl('/schedule'))
      await page.goto(portalUrl('/account'))
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    },
  )

  test(
    'a session waiting for its code reads the public pages, keeps an unspent link, and can sign out',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const { account } = await accountWithTwoFactor(page, accounts)
      await signInToPortal(page, account.email, account.password)
      await expect(page).toHaveURL(portalUrl('/auth/mfa'))

      // A public page renders as for a visitor, and the header offers to finish signing in.
      await page.goto(portalUrl('/privacy'))
      await expect(page).toHaveURL(portalUrl('/privacy'))
      await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Finish signing in' })).toHaveAttribute(
        'href',
        '/auth/mfa?redirect=%2Fprivacy',
      )
      await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)

      // An unspent link opened in this browser keeps its button, whichever account it is for.
      await page.goto(portalUrl('/forgot-password'))
      await page.getByLabel('Email', { exact: true }).fill(account.email)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await expect(page.getByRole('status')).toContainText(`If an account uses ${account.email}`)
      const link = confirmLinkIn(await waitForMail(account.email))
      await page.goto(link)
      await expect(page).toHaveURL(link)
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()

      // The code screen lets the session go, and another person can sign in.
      await page.goto(portalUrl('/auth/mfa'))
      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(page).toHaveURL(portalUrl('/login'))
      await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
      await page.goto(portalUrl('/schedule'))
      await expect(page).toHaveURL(portalUrl('/login?redirect=%2Fschedule'))
    },
  )

  test(
    'a password reset asks for the code, then shows the password form without the link again',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const { account, secret } = await accountWithTwoFactor(page, accounts)

      await page.goto(portalUrl('/forgot-password'))
      await page.getByLabel('Email', { exact: true }).fill(account.email)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await expect(page.getByRole('status')).toContainText(`If an account uses ${account.email}`)

      await page.goto(confirmLinkIn(await waitForMail(account.email)))
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page).toHaveURL(portalUrl('/auth/mfa?redirect=%2Fauth%2Fconfirm'))
      await enterCode(page, codeFor(secret))

      // The spent link is gone from the address, and the form does not ask for it.
      await expect(page).toHaveURL(portalUrl('/auth/confirm'))
      await page.getByLabel('New password').fill('e2e-new-password-456')
      await page.getByLabel('Repeat the password').fill('e2e-new-password-456')
      await page.getByRole('button', { name: 'Save the password' }).click()
      await expect(page).toHaveURL(portalUrl('/account'))
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    },
  )

  test(
    'confirming the deletion with the password leads through the code and back to the deletion',
    { tag: '@mobile' },
    async ({ page, accounts, db }) => {
      const { account, secret } = await accountWithTwoFactor(page, accounts)
      await signInToPortal(page, account.email, account.password)
      await enterCode(page, codeFor(secret))
      await expect(page).toHaveURL(portalUrl('/account'))

      await page.getByRole('button', { name: 'Delete my account' }).click()
      await page.getByLabel('Your password').fill(account.password)
      await page.getByRole('button', { name: 'Delete my account' }).click()
      await expect(page).toHaveURL(portalUrl('/auth/mfa?redirect=%2Faccount%3Fconfirm%3Ddeletion'))
      expect(await accountIds(db, [account.email])).toEqual([account.id])
      await enterCode(page, codeFor(secret))

      await expect(page).toHaveURL(portalUrl('/account'))
      await expect(page.getByText('You confirmed it is you again.')).toBeVisible()
      await page.getByRole('button', { name: 'Delete my account' }).click()

      await expect(page).toHaveURL(portalUrl('/'))
      await expect(page.getByRole('status')).toHaveText('Your account has been deleted.')
      expect(await accountIds(db, [account.email])).toEqual([])
    },
  )

  test(
    'a recovery code turns it off, and the next sign-in asks for no code',
    { tag: '@mobile' },
    async ({ page, accounts }) => {
      const { account, recoveryCodes } = await accountWithTwoFactor(page, accounts)

      await signInToPortal(page, account.email, account.password)
      await expect(page).toHaveURL(portalUrl('/auth/mfa'))
      await page.getByRole('button', { name: 'Use a recovery code' }).click()
      // Read ignoring case, spaces and hyphens.
      const typed = recoveryCodes[0]!.toLowerCase().replace(/(.{4})(?=.)/g, '$1-')
      await page.getByLabel('Recovery code').fill(typed)
      await page.getByRole('button', { name: 'Continue' }).click()

      await expect(page).toHaveURL(portalUrl('/account'))
      await expect(page.getByText('Two-factor authentication is off.')).toBeVisible()
      await signOutOfPortal(page)
      await signInToPortal(page, account.email, account.password)
      await expect(page).toHaveURL(portalUrl('/account'))
    },
  )

  test('a panel session waiting for its code reads /invitation, keeps an unspent link, and can sign out', async ({
    page,
    accounts,
    tenants,
  }) => {
    // An invitation and an unspent confirmation link, both for an address of nobody's.
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const edition = await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    const invitee = accounts.freshEmail('invitee')
    await signInToPanel(page, head.email, head.password)
    await page.goto(panelUrl(`/${tenant.slug}/settings/team`))
    const invite = page.getByRole('region', { name: 'Invite to the team' })
    await invite.getByLabel('Email').fill(invitee)
    await invite.getByLabel(`Programme in ${edition.name}`).selectOption('write')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(invite.getByRole('status')).toContainText(`An invitation has gone to ${invitee}.`)
    await signOutOfPanel(page, head.email)
    const invitation = invitationLinkIn(await waitForMail(invitee))
    await page.goto(invitation)
    const signUp = page.getByRole('region', { name: 'I am new to OPOS' })
    await signUp.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('status')).toContainText(`We sent a link to ${invitee}.`)
    const link = confirmLinkIn(await waitForMail(invitee, 2))

    // Another person's browser now waits for its code in the panel.
    const { account } = await accountWithTwoFactor(page, accounts)
    await signInToPanel(page, account.email, account.password)
    await expect(page).toHaveURL(panelUrl('/auth/mfa'))

    // The invitation keeps its preview and offers to finish signing in in place of joining.
    await page.goto(invitation)
    await expect(page.getByRole('heading', { name: 'Join the organizing team' })).toBeVisible()
    await expect(
      page.getByText(`You are invited to the organizing team of ${tenant.name}.`),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Finish signing in' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'I am new to OPOS' })).toHaveCount(0)

    // An unspent link keeps its button.
    await page.goto(link)
    await expect(page).toHaveURL(link)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()

    // The code screen lets the session go.
    await page.goto(panelUrl('/auth/mfa'))
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(panelUrl('/login'))
  })

  test('the panel on the same account asks for its own code', async ({ page, accounts }) => {
    const account = await accounts.create()
    await signInToPortal(page, account.email, account.password)
    const { secret } = await turnOn(page)

    // The portal session stays at aal2; the panel's own session starts below it.
    await signInToPanel(page, account.email, account.password)
    await expect(page).toHaveURL(panelUrl('/auth/mfa'))
    await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible()
    await enterCode(page, codeFor(secret))

    await expect(page).toHaveURL(panelUrl('/'))
    await page.goto(portalUrl('/account'))
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  })
})
