import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import {
  nameClearedEmail,
  type NoticeContent,
  profileReportOutcomeEmail,
  profileReportReceivedEmail,
  profileRestoredEmail,
  profileTakenDownEmail,
} from './emails'

const CONTACT = 'contact@example.test'

/** Every sentence of a notice, in `locale`, in the order it is read. */
async function sentences(content: NoticeContent, locale: 'en' | 'pl' = 'en') {
  const i18n = setupI18n()
  await activateLocale(i18n, locale)
  return [
    i18n._(content.subject),
    i18n._(content.body),
    ...(content.details ?? []).map((detail) => i18n._(detail)),
    ...(content.quote ? [content.quote] : []),
    i18n._(content.note),
  ]
}

// docs/specs/0016-public-profile.md, R7 and R8.
describe('the emails to who sent a report', () => {
  it('say that the report arrived, in the words of OPOS alone', async () => {
    const text = (await sentences(profileReportReceivedEmail)).join('\n')

    expect(text).toMatch(/Your report of a profile on OPOS has reached the administrators/)
    expect(profileReportReceivedEmail.quote).toBeUndefined()
  })

  it('say what came of it: the profile taken down, or the report closed and the profile left', async () => {
    const down = (await sentences(profileReportOutcomeEmail('taken-down', CONTACT))).join('\n')
    const closed = (await sentences(profileReportOutcomeEmail('closed', CONTACT))).join('\n')

    expect(down).toMatch(/took it down/)
    expect(closed).toMatch(/It stays as it is/)
    for (const text of [down, closed]) expect(text).toContain(CONTACT)
  })

  it('are written in Polish for a report sent from a Polish page', async () => {
    const [subject] = await sentences(profileReportOutcomeEmail('closed', CONTACT), 'pl')

    expect(subject).toBe('Zgłoszony profil zostaje')
  })
})

// docs/specs/0016-public-profile.md, T5, T9 and T10.
describe('the emails to the account', () => {
  it('say of a takedown what was done, the rule behind it, whether a report came first, who decided and how to contest it', async () => {
    const content = profileTakenDownEmail({
      reason: 'identity',
      afterReport: true,
      note: 'The picture shows someone else.',
      contact: CONTACT,
    })
    const text = (await sentences(content)).join('\n')

    expect(text).toMatch(/took your profile down/)
    expect(text).toMatch(/your avatar was removed/)
    expect(text).toMatch(
      /the terms of OPOS do not allow a profile to show a picture, a name or an identity of someone else/,
    )
    expect(text).toMatch(/followed a report/)
    expect(text).toMatch(/by a person, an administrator, and not by a program/)
    expect(content.quote).toBe('The picture shows someone else.')
    expect(text).toMatch(/ask for a review/)
    expect(text).toContain(CONTACT)
  })

  it('say that no report came first, and quote nothing an admin did not write', async () => {
    const content = profileTakenDownEmail({
      reason: 'spam',
      afterReport: false,
      note: null,
      contact: CONTACT,
    })
    const text = (await sentences(content)).join('\n')

    expect(text).toMatch(/do not allow spam or advertising in a profile/)
    expect(text).toMatch(/with no report/)
    expect(content.quote).toBeUndefined()
    expect(text).not.toMatch(/The administrator wrote/)
  })

  it('say of a restored profile that it is not public until the account publishes it', async () => {
    expect((await sentences(profileRestoredEmail)).join('\n')).toMatch(/It is not public yet/)
  })

  it('say of a cleared name what went, the rule behind it and how to contest it', async () => {
    const text = (
      await sentences(nameClearedEmail({ reason: 'offensive', contact: CONTACT }))
    ).join('\n')

    expect(text).toMatch(/cleared the name of your account/)
    expect(text).toMatch(/do not allow an offensive, hateful or unlawful name/)
    expect(text).toMatch(/by a person, an administrator, and not by a program/)
    expect(text).toContain(CONTACT)
  })

  it('are written in Polish for an account that reads Polish', async () => {
    const lines = await sentences(
      profileTakenDownEmail({
        reason: 'offensive',
        afterReport: true,
        note: null,
        contact: CONTACT,
      }),
      'pl',
    )

    expect(lines[0]).toBe('Twój profil został zdjęty')
    expect(lines.join('\n')).toMatch(/regulamin OPOS nie pozwala/)
    expect(lines.join('\n')).toContain(CONTACT)
  })
})
