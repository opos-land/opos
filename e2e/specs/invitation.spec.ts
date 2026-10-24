import { type Page } from '@playwright/test'
import { accessToken, callApi } from '../fixtures/api'
import { passwordGrant } from '../fixtures/auth-admin'
import { expect, test } from '../fixtures'
import { invitationLinkIn, verifyLinkIn, waitForMail } from '../fixtures/mailpit'
import { panelUrl, signInToPanel, signOutOfPanel } from '../fixtures/ui'

// PLAN.md 15.2, scenario 6: an invitee without an account registers in the panel on
// /invitation, confirms the address, chooses a password and joins the team (PLAN.md 7.7).

const INVITEE_PASSWORD = 'e2e-invitee-password-789'

/** From the invitation link to the convention's dashboard, through the email-only sign-up. */
async function signUpAndJoin(page: Page, email: string, tenant: { slug: string; name: string }) {
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
  await page.goto(verifyLinkIn(await waitForMail(email, 2)))
  await expect(page.getByText(`Your address ${email} is confirmed.`)).toBeVisible()
  await page.getByLabel('New password').fill(INVITEE_PASSWORD)
  await page.getByLabel('Repeat the password').fill(INVITEE_PASSWORD)
  await page.getByRole('button', { name: 'Save the password and join the team' }).click()

  await expect(page).toHaveURL(panelUrl(`/${tenant.slug}`))
  await expect(
    page.getByRole('navigation', { name: tenant.name }).getByRole('link', { name: 'Dashboard' }),
  ).toBeVisible()
}

test.describe('organizer invitation to an address without an account', () => {
  test('the invitee signs up on /invitation and sees only their edition', async ({
    page,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email })
    await tenants.addEdition(tenant.id, { name: 'Spring edition' })
    await tenants.addEdition(tenant.id, { name: 'Autumn edition' })
    const invitee = accounts.freshEmail('invitee')

    await signInToPanel(page, head.email, head.password)
    await page.goto(panelUrl(`/${tenant.slug}/team`))
    const invite = page.getByRole('region', { name: 'Invite to the team' })
    await invite.getByLabel('Email').fill(invitee)
    await invite.getByLabel('Programme in Spring edition').selectOption('write')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(invite.getByRole('status')).toContainText(`An invitation has gone to ${invitee}.`)

    // The head leaves the browser to the invitee.
    await signOutOfPanel(page, head.email)

    await signUpAndJoin(page, invitee, tenant)

    // An org without settings sees no team or settings, and only the editions it holds a level in.
    const sidebar = page.getByRole('navigation', { name: tenant.name })
    await expect(sidebar.getByRole('link', { name: 'Team' })).toHaveCount(0)
    await sidebar.getByRole('link', { name: 'Editions' }).click()
    await expect(page.getByRole('link', { name: 'Spring edition' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Autumn edition' })).toHaveCount(0)
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

    await signUpAndJoin(page, squatter.email, tenant)

    expect((await passwordGrant(squatter.email, squatter.password)).status).toBe(400)
    expect((await passwordGrant(squatter.email, INVITEE_PASSWORD)).status).toBe(200)
    expect(await tenants.membership(tenant.id, squatter.id)).toMatchObject({ role: 'org' })
  })
})
