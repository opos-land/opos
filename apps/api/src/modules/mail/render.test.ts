import { setupI18n } from '@lingui/core'
import { activateLocale } from '@opos/i18n'
import {
  type EmailContent,
  emailChangeNewEmail,
  recoveryEmail,
  signupEmail,
} from '@opos/i18n/emails'
import { describe, expect, it } from 'vitest'
import { renderLinkEmail } from './render'

const link = 'http://localhost:9999/verify?token=abc&type=signup&redirect_to=http%3A%2F%2Fx'

const render = async (locale: 'en' | 'pl', content: EmailContent, url: string) => {
  const i18n = setupI18n()
  await activateLocale(i18n, locale)
  return renderLinkEmail(i18n, content, url)
}

describe('renderLinkEmail', () => {
  it('renders the English source text', async () => {
    const email = await render('en', signupEmail, link)

    expect(email.subject).toBe('Confirm your email address')
    expect(email.text).toContain(`Confirm email address: ${link}`)
    expect(email.html).toContain('lang="en"')
  })

  it('renders the Polish translation', async () => {
    const email = await render('pl', recoveryEmail, link)

    expect(email.subject).toBe('Zresetuj hasło')
    expect(email.text).toContain('Link jest ważny przez godzinę')
    expect(email.html).toContain('Ustaw nowe hasło')
  })

  it('puts the link into both parts, escaped in the HTML', async () => {
    const email = await render('en', signupEmail, link)

    expect(email.html).toContain(`href="${link.replaceAll('&', '&amp;')}"`)
    expect(email.html).not.toContain('&type=')
  })

  it('escapes the values a user typed', async () => {
    const email = await render('en', emailChangeNewEmail('<b>x</b>@example.test'), link)

    expect(email.text).toContain('<b>x</b>@example.test')
    expect(email.html).toContain('&lt;b&gt;x&lt;/b&gt;@example.test')
    expect(email.html).not.toContain('<b>x</b>')
  })
})
