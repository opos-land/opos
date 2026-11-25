import { type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { PASSWORD } from '../fixtures/auth-admin'
import { confirmLinkIn, waitForMail } from '../fixtures/mailpit'
import { png } from '../fixtures/pictures'
import { publishProfile } from '../fixtures/profiles'
import { adminUrl, notification, portalUrl, signInToAdmin, signInToPortal } from '../fixtures/ui'

// The public profile (docs/specs/0016-public-profile.md): an account shows a profile, anyone
// reads and reports it, and an admin takes it down, restores it and clears a name. Every
// scenario makes its own accounts and conventions.

const IN_90_DAYS = () => new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

/** A picture the browser has loaded, not a broken one. */
async function expectLoaded(page: Page, name: string) {
  const picture = page.getByRole('img', { name, exact: true })
  await expect(picture).toBeVisible()
  await expect
    .poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0)
}

/** Uploads an avatar on `/account/profile`, the first of the account or one after a takedown. */
async function uploadAvatar(page: Page) {
  await page
    .getByLabel('Avatar file')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(400, 300) })
  await page.getByRole('button', { name: 'Upload the avatar' }).click()
  await expect(notification(page, 'success', 'Your avatar is saved.')).toBeVisible()
  await expectLoaded(page, 'Your avatar')
}

/** Publishes the profile on `/account/profile` and returns the address everyone reads it at. */
async function publish(page: Page) {
  await page.getByRole('button', { name: 'Publish the profile' }).click()
  await expect(notification(page, 'success', 'Your profile is public.')).toBeVisible()
  const link = page.getByRole('link', { name: 'See your profile as everyone does' })
  return portalUrl((await link.getAttribute('href'))!)
}

/** Sends a report of the profile at `address` as a visitor with no session. */
async function report(
  visitor: Page,
  address: string,
  { reason, note, email }: { reason: string; note?: string; email?: string },
) {
  await visitor.goto(address)
  await visitor.getByRole('link', { name: 'Report this profile' }).click()
  await visitor.getByLabel('Why are you reporting it?').selectOption({ label: reason })
  if (note) await visitor.getByLabel('What should we know? (optional)').fill(note)
  if (email) await visitor.getByLabel('Your email address (optional)').fill(email)
  await visitor.getByRole('button', { name: 'Send the report' }).click()
  await expect(visitor.getByText('Your report has reached the administrators.')).toBeVisible()
}

test.describe('the public profile', () => {
  test(
    'a new account sets a nickname, fills its profile in, uploads an avatar and publishes; a visitor reads it until it is withdrawn',
    { tag: '@mobile' },
    async ({ page, newContext, accounts }) => {
      const email = accounts.freshEmail('profile')

      // The terms are accepted by registering, linked beside the privacy policy.
      await page.goto(portalUrl('/register'))
      await expect(page.getByRole('link', { name: 'terms', exact: true })).toHaveAttribute(
        'href',
        '/terms',
      )
      await expect(page.getByRole('link', { name: 'privacy policy', exact: true })).toBeVisible()
      await page.getByLabel('First name').fill('Ada')
      await page.getByLabel('Last name').fill('Lovelace')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByRole('button', { name: 'Create an account' }).click()
      await page.goto(confirmLinkIn(await waitForMail(email)))
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByLabel('New password').fill(PASSWORD)
      await page.getByLabel('Repeat the password').fill(PASSWORD)
      await page.getByRole('button', { name: 'Save the password' }).click()
      await expect(page).toHaveURL(portalUrl('/account'))

      // The nickname, after the names: the form shows the public name before it is saved.
      const name = page
        .locator('form')
        .filter({ has: page.getByLabel('Nickname', { exact: true }) })
      await name.getByLabel('Nickname', { exact: true }).fill('Countess')
      await name.getByLabel('Where the nickname stands').selectOption('nickname-last')
      await expect(name.getByText('Ada Lovelace “Countess”')).toBeVisible()
      await name.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(notification(page, 'success', 'Your name is saved.')).toBeVisible()

      await expect(page.getByText('Your profile is private: only you see it.')).toBeVisible()
      await page.getByRole('link', { name: 'Change your profile' }).click()
      await expect(page).toHaveURL(portalUrl('/account/profile'))
      await page.getByLabel('About you').fill('Writes programmes for engines.\nRuns a book club.')
      await page.getByLabel('Pronouns').fill('she/her')
      await page.getByLabel('City or region').fill('London')
      await page.getByLabel('Link 1').fill('https://example.com/ada')
      await page.getByRole('checkbox', { name: 'Literature' }).check()
      await page.getByRole('checkbox', { name: 'Board games' }).check()
      await page.getByRole('button', { name: 'Save the profile' }).click()
      await expect(notification(page, 'success', 'Your profile is saved.')).toBeVisible()

      await uploadAvatar(page)
      const address = await publish(page)
      // Never the identifier of the account: a random one of the profile's own.
      expect(address).toMatch(/\/profiles\/[A-Za-z0-9_-]{16,}$/)

      // Anyone reads it, with no session.
      const outside = await newContext()
      const visitor = await outside.newPage()
      await visitor.goto(address)
      await expect(
        visitor.getByRole('heading', { name: 'Ada Lovelace “Countess”', level: 1 }),
      ).toBeVisible()
      await expect(visitor.getByText('she/her')).toBeVisible()
      await expect(visitor.getByText('London')).toBeVisible()
      await expect(visitor.getByText('Runs a book club.')).toBeVisible()
      await expect(
        visitor.getByRole('list', { name: 'Interests' }).getByRole('listitem'),
      ).toHaveText(['Board games', 'Literature'])
      await expect(visitor.getByRole('link', { name: 'https://example.com/ada' })).toHaveAttribute(
        'rel',
        /nofollow/,
      )
      await expectLoaded(visitor, 'Avatar of Ada Lovelace “Countess”')
      // The page asks search engines to leave it out.
      await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

      // Withdrawn, it is a page that is not there; what it held stays with the account.
      await page.getByRole('button', { name: 'Withdraw the profile' }).click()
      await expect(notification(page, 'success', 'Your profile is private again.')).toBeVisible()
      await visitor.reload()
      await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible()
      await expect(page.getByLabel('City or region')).toHaveValue('London')
      await outside.close()
    },
  )

  test('the programme names a speaker by the public name, leads to a published profile and shows a speaker with no name as Anon', async ({
    page,
    newContext,
    accounts,
    tenants,
  }) => {
    const head = await accounts.create()
    const named = await accounts.create({ metadata: { first_name: 'Kasia', last_name: 'Mazur' } })
    const nameless = await accounts.create()
    const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
    const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
    const item = await tenants.addProgramItem(
      tenant.id,
      edition.id,
      'Maps of nowhere',
      IN_90_DAYS(),
    )
    await tenants.addSpeaker(tenant.id, item, named.id)
    await tenants.addSpeaker(tenant.id, item, nameless.id)
    const itemPage = portalUrl(`/conventions/${tenant.slug}/${edition.slug}/program/${item}`)

    const outside = await newContext()
    const visitor = await outside.newPage()
    await visitor.goto(itemPage)
    // No profile is published yet: both are named, neither is a link.
    await expect(visitor.getByText('Speakers: Kasia Mazur, Anon')).toBeVisible()
    await expect(visitor.getByRole('link', { name: 'Kasia Mazur' })).toHaveCount(0)

    await signInToPortal(page, named.email, named.password)
    const name = page.locator('form').filter({ has: page.getByLabel('Nickname', { exact: true }) })
    await name.getByLabel('Nickname', { exact: true }).fill('Mazurek')
    await name.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(notification(page, 'success', 'Your name is saved.')).toBeVisible()
    await page.goto(portalUrl('/account/profile'))
    const address = await publish(page)

    await visitor.reload()
    await expect(visitor.getByText('Speakers: Kasia “Mazurek” Mazur, Anon')).toBeVisible()
    await expect(visitor.getByRole('link', { name: 'Anon' })).toHaveCount(0)
    await visitor.getByRole('link', { name: 'Kasia “Mazurek” Mazur' }).click()
    await expect(visitor).toHaveURL(address)
    await expect(
      visitor.getByRole('heading', { name: 'Kasia “Mazurek” Mazur', level: 1 }),
    ).toBeVisible()
    await expect(visitor.getByText('This profile holds nothing yet.')).toBeVisible()
    await outside.close()
  })

  test('a visitor reports a profile, an admin takes it down with a reason, the account asks for a review and publishes again once restored', async ({
    page,
    context,
    newContext,
    accounts,
    admins,
  }) => {
    const admin = await admins.create()
    const account = await accounts.create({
      metadata: { first_name: 'Rita', last_name: 'Reported' },
    })
    const reporter = accounts.freshEmail('reporter')
    const sentence = 'A profile is not a place to sell dice.'

    await signInToPortal(page, account.email, account.password)
    await page.goto(portalUrl('/account/profile'))
    await uploadAvatar(page)
    const address = await publish(page)

    const outside = await newContext()
    const visitor = await outside.newPage()
    await report(visitor, address, {
      reason: 'Spam or advertising',
      note: 'It only advertises a shop.',
      email: reporter,
    })
    expect((await waitForMail(reporter)).Subject).toBe('We received your report of a profile')

    // The admin reads the report, opens the profile it reports and takes it down.
    const desk = await context.newPage()
    await signInToAdmin(desk, admin)
    await desk.getByRole('link', { name: 'Profile reports', exact: true }).click()
    await desk.getByRole('link', { name: 'Rita Reported', exact: true }).click()
    await expect(
      desk.getByRole('heading', { name: 'Profile report', exact: true, level: 1 }),
    ).toBeVisible()
    await expect(desk.getByText('Spam or advertising')).toBeVisible()
    await expect(desk.getByText('It only advertises a shop.')).toBeVisible()
    await expect(desk.getByText(reporter)).toBeVisible()
    await desk.getByRole('link', { name: 'Open the reported profile' }).click()
    await expect(desk.getByRole('heading', { name: 'Rita Reported', level: 1 })).toBeVisible()
    await expect(desk.getByText('Published', { exact: true })).toBeVisible()
    await expectLoaded(desk, 'Avatar of Rita Reported')

    await desk.getByRole('button', { name: 'Take the profile down' }).click()
    const modal = desk.getByRole('alertdialog')
    await modal.getByLabel('Reason').selectOption({ label: 'Spam or advertising' })
    await modal.getByLabel('A sentence for the account (optional)').fill(sentence)
    await modal.getByRole('button', { name: 'Take the profile down' }).click()
    await expect(
      notification(desk, 'success', 'The profile is taken down, and the account got an email'),
    ).toBeVisible()
    await expect(desk.getByText('Taken down', { exact: true })).toBeVisible()
    await expect(desk.getByText('The account has no avatar.')).toBeVisible()

    // Everyone is told: who reported it, and the account, in the admin's own words too.
    expect((await waitForMail(reporter, 2)).Subject).toBe('The profile you reported was taken down')
    expect((await waitForMail(account.email)).Text).toContain(sentence)
    await visitor.goto(address)
    await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible()

    // The account reads why, cannot publish, uploads a new avatar and asks for a review.
    await page.reload()
    const notice = page.getByRole('alert').filter({ hasText: 'took your profile down' })
    await expect(notice).toContainText('do not allow spam or advertising')
    await expect(notice).toContainText('followed a report')
    await expect(notice).toContainText(sentence)
    await expect(page.getByRole('button', { name: 'Publish the profile' })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Your avatar' })).toHaveCount(0)
    await uploadAvatar(page)
    await notice.getByRole('button', { name: 'Ask for a review' }).click()
    await expect(notification(page, 'success', 'You asked for a review.')).toBeVisible()
    await expect(notice.getByRole('button', { name: 'Ask for a review' })).toHaveCount(0)

    // The admin finds the request among the profiles taken down, sees the new avatar and restores.
    await desk.getByRole('link', { name: 'Profiles', exact: true }).click()
    const row = desk.getByRole('row').filter({ hasText: account.email })
    await expect(row).toContainText('Review requested')
    await row.getByRole('link', { name: 'Rita Reported', exact: true }).click()
    await expectLoaded(desk, 'Avatar of Rita Reported')
    await desk.getByRole('button', { name: 'Restore the profile' }).click()
    await expect(
      notification(desk, 'success', 'The profile is restored, and the account got an email'),
    ).toBeVisible()
    await expect(desk.getByText('Private', { exact: true })).toBeVisible()

    // Restoring publishes nothing: the account does.
    await visitor.reload()
    await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: 'took your profile down' })).toHaveCount(
      0,
    )
    expect(await publish(page)).toBe(address)
    await visitor.reload()
    await expect(visitor.getByRole('heading', { name: 'Rita Reported', level: 1 })).toBeVisible()

    await desk.getByRole('link', { name: 'Log', exact: true }).click()
    const logged = desk.getByRole('row').filter({ hasText: account.email })
    await expect(logged).toHaveCount(2)
    await expect(logged.nth(0)).toContainText('Restored the profile')
    await expect(logged.nth(1)).toContainText('Took the profile down')
    await outside.close()
  })

  test('an admin closes a report that changes nothing, finds an account by its email address and clears its name; the programme shows Anon', async ({
    page,
    newContext,
    db,
    accounts,
    admins,
    tenants,
  }) => {
    const admin = await admins.create()
    const head = await accounts.create()
    const speaker = await accounts.create({
      metadata: { first_name: 'Borys', last_name: 'Borrowed' },
    })
    const tenant = await tenants.create({ headEmail: head.email, timezone: 'Europe/Warsaw' })
    const edition = await tenants.addEdition(tenant.id, { isActive: true, isPublished: true })
    const item = await tenants.addProgramItem(
      tenant.id,
      edition.id,
      'Whose name is it',
      IN_90_DAYS(),
    )
    await tenants.addSpeaker(tenant.id, item, speaker.id)
    const itemPage = portalUrl(`/conventions/${tenant.slug}/${edition.slug}/program/${item}`)
    const address = portalUrl(`/profiles/${await publishProfile(db, speaker.id)}`)

    const outside = await newContext()
    const visitor = await outside.newPage()
    await report(visitor, address, { reason: 'Another reason' })

    // A report the admin finds nothing in is closed, and the profile stays.
    await signInToAdmin(page, admin)
    await page.goto(adminUrl('/profile-reports'))
    await page.getByRole('link', { name: 'Borys Borrowed', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Profile report', exact: true, level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('The report holds no note.')).toBeVisible()
    await page.getByRole('button', { name: 'Close the report' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close the report' }).click()
    await expect(notification(page, 'success', 'The report is closed.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close the report' })).toHaveCount(0)
    await visitor.goto(address)
    await expect(visitor.getByRole('heading', { name: 'Borys Borrowed', level: 1 })).toBeVisible()

    // The name is another matter: it shows in the programme whatever the profile does.
    await page.getByRole('link', { name: 'Profiles', exact: true }).click()
    await page.getByLabel('Email address of the account').fill('nobody@example.test')
    await page.getByRole('button', { name: 'Open the account' }).click()
    await expect(page.getByRole('alert')).toContainText('No account uses this email address.')
    await page.getByLabel('Email address of the account').fill(speaker.email)
    await page.getByRole('button', { name: 'Open the account' }).click()
    await expect(page.getByRole('heading', { name: 'Borys Borrowed', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Clear the name' }).click()
    const modal = page.getByRole('alertdialog')
    await modal.getByLabel('Reason').selectOption({ label: 'Someone else’s picture or identity' })
    await modal.getByRole('button', { name: 'Clear the name' }).click()
    await expect(
      notification(page, 'success', 'The name is cleared, and the account got an email'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Anon', level: 1 })).toBeVisible()
    await expect(page.getByText('This account has no part of a name.')).toBeVisible()
    await waitForMail(speaker.email)

    await visitor.goto(itemPage)
    await expect(visitor.getByText('Speaker: Anon')).toBeVisible()
    await visitor.goto(address)
    await expect(visitor.getByRole('heading', { name: 'Anon', level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Log', exact: true }).click()
    const logged = page.getByRole('row').filter({ hasText: speaker.email })
    await expect(logged).toHaveCount(2)
    await expect(logged.nth(0)).toContainText('Cleared the name of the account')
    await expect(logged.nth(1)).toContainText('Closed a profile report')
    await outside.close()
  })
})
