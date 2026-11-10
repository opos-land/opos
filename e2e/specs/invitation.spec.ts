import { type Page } from '@playwright/test'
import { accessToken, callApi } from '../fixtures/api'
import { passwordGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { confirmLinkIn, invitationLinkIn, waitForMail } from '../fixtures/mailpit'
import {
  notification,
  openPanelSwitcher,
  panelUrl,
  signInToPanel,
  signOutOfPanel,
} from '../fixtures/ui'

// An invitee without an account registers in the panel on /invitation, confirms the address,
// chooses a password and joins the team.

const INVITEE_PASSWORD = 'e2e-invitee-password-789'

/** From the invitation link into the invitee's only edition, through the email-only sign-up. */
async function signUpAndJoin(
  page: Page,
  email: string,
  tenant: { slug: string; name: string },
  edition: { slug: string; name: string },
) {
  await page.goto(invitationLinkIn(await waitForMail(email)))
  await expect(page.getByRole('heading', { name: 'Join the organizing team' })).toBeVisible()
  await expect(
    page.getByText(`You are invited to the organizing team of ${tenant.name}.`),
  ).toBeVisible()

  const signUp = page.getByRole('region', { name: 'I am new to OPOS' })
  await expect(signUp.getByLabel('Email')).toHaveValue(email)
  await signUp.getByRole('button', { name: 'Create an account' }).click()
  await expect(page.getByRole('status')).toContainText(`We sent a link to ${email}.`)

  // The second message: the invitation came first, then the confirmation of the address.
  // Opening the link spends nothing; its button signs the browser in, then the password follows.
  await page.goto(confirmLinkIn(await waitForMail(email, 2)))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(`Your address ${email} is confirmed.`)).toBeVisible()
  await page.getByLabel('New password').fill(INVITEE_PASSWORD)
  await page.getByLabel('Repeat the password').fill(INVITEE_PASSWORD)
  await page.getByRole('button', { name: 'Save the password and join the team' }).click()

  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}/editions/${edition.slug}`))
  await expect(page.getByRole('navigation', { name: edition.name })).toBeVisible()
}

test.describe('organizer invitation to an address without an account', () => {
  test('the invitee signs up on /invitation and sees only their edition', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const spring = await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    await tenants.addEdition(tenant.id, { name: 'Autumn edition' })
    const invitee = accounts.freshEmail('invitee')

    await signInToPanel(page, head.email, head.password)
    await page.goto(panelUrl(`/${tenant.slug}/settings/team/invite`))
    const invite = page.getByRole('region', { name: 'Invitation' })
    await invite.getByLabel('Email').fill(invitee)
    await invite.getByLabel('Programme in Spring edition').selectOption('write')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(
      notification(page, 'success', `An invitation has gone to ${invitee}.`),
    ).toBeVisible()

    // The head leaves the browser to the invitee.
    await signOutOfPanel(page, head.email)

    await signUpAndJoin(page, invitee, tenant, spring)

    // The invitee works in that edition alone: its menu holds what the invitation granted, with
    // no convention settings and no other edition to switch to.
    const editionMenu = page.getByRole('navigation', { name: spring.name })
    await expect(editionMenu.getByRole('link')).toHaveText(['Dashboard', 'Programme'])
    await openPanelSwitcher(page)
    await expect(page.getByRole('menuitem')).toHaveText([spring.name])
    await expect(page.getByText('Autumn edition')).toHaveCount(0)
    expect((await passwordGrant(invitee, INVITEE_PASSWORD)).status).toBe(200)
  })

  test('a password someone set on the unconfirmed address before does not survive', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    const edition = await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    // Someone else registered the address first and never confirmed it.
    const squatter = await accounts.create({ confirmed: false, password: 'squatter-password-1' })

    const sent = await callApi('/tenants/current/members', {
      method: 'POST',
      token: await accessToken(head.email, head.password),
      tenantSlug: tenant.slug,
      body: {
        email: squatter.email,
        role: 'org',
        editions: [
          {
            editionId: edition.id,
            programAccess: 'read',
            ticketsAccess: 'none',
            websiteContentAccess: 'none',
          },
        ],
      },
    })
    // An unconfirmed account counts as no account: the address gets a signed invitation.
    expect(sent.body).toMatchObject({ outcome: 'invited', email: squatter.email })

    await signUpAndJoin(page, squatter.email, tenant, edition)

    expect((await passwordGrant(squatter.email, squatter.password)).status).toBe(400)
    expect((await passwordGrant(squatter.email, INVITEE_PASSWORD)).status).toBe(200)
    expect(await tenants.membership(tenant.id, squatter.id)).toMatchObject({ role: 'org' })
  })
})
