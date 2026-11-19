import { setupI18n } from '@lingui/core'
import { activateLocale } from '@opos/i18n'
import {
  type EmailContent,
  emailChangeNewEmail,
  invitationEmail,
  joinedTeamEmail,
  mfaDisabledEmail,
  recoveryEmail,
  signupEmail,
} from '@opos/i18n/emails'
import { describe, expect, it } from 'vitest'
import { type OrderEmailContent, orderExpiredEmail } from '@opos/i18n/order-emails'
import { renderLinkEmail, renderNoticeEmail, renderOrderEmail } from './render'

const link =
  'http://127.0.0.1:54321/auth/v1/verify?token=abc&type=signup&redirect_to=http%3A%2F%2Fx'

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

  it('puts the validity of the email itself below the link', async () => {
    const email = await render('pl', invitationEmail('Konwent A'), link)

    expect(email.subject).toBe('Zaproszenie do zespołu organizatorów konwentu Konwent A')
    expect(email.text).toContain('Link jest ważny przez 7 dni i działa tylko raz.')
    expect(email.text).not.toContain('godzinę')
  })

  it('leaves the validity out of an email without one', async () => {
    const email = await render('en', joinedTeamEmail('Convention A'), link)

    expect(email.subject).toBe('You have joined the organizing team of Convention A')
    expect(email.text).not.toContain('valid')
    expect(email.html).not.toContain('valid for')
  })
})

describe('renderNoticeEmail', () => {
  const notice = async (locale: 'en' | 'pl') => {
    const i18n = setupI18n()
    await activateLocale(i18n, locale)
    return renderNoticeEmail(i18n, mfaDisabledEmail)
  }

  it('renders the English source text with no link', async () => {
    const email = await notice('en')

    expect(email.subject).toBe('Two-factor authentication was turned off')
    expect(email.text).toContain('change your password right away')
    expect(email.text).not.toContain('http')
    expect(email.html).toContain('lang="en"')
    expect(email.html).not.toContain('href=')
  })

  it('renders the Polish translation', async () => {
    const email = await notice('pl')

    expect(email.subject).toBe('Uwierzytelnianie dwuskładnikowe zostało wyłączone')
    expect(email.text).toContain('Jeśli to nie ty, natychmiast zmień hasło')
    expect(email.text).toContain('na twoim koncie OPOS')
    expect(email.html).toContain('lang="pl"')
  })
})

describe('renderOrderEmail', () => {
  const content: OrderEmailContent = {
    subject: { id: 'subject', message: 'Order <A&B>' },
    parts: [
      { kind: 'paragraph', text: { id: 'p', message: 'Thank you & welcome.' } },
      { kind: 'heading', text: { id: 'h', message: 'Your order' } },
      {
        kind: 'rows',
        rows: [
          { label: '2 × <Pin>', value: '10,00 zł' },
          { label: { id: 't', message: 'Total' }, value: '10,00 zł', strong: true },
        ],
      },
      { kind: 'image', cid: 'qr@opos', alt: { id: 'alt', message: 'The QR code' }, caption: 'ABC' },
      {
        kind: 'link',
        label: { id: 'l', message: 'See your order' },
        url: 'https://x.test/?a=1&b=2',
      },
      { kind: 'link', label: 'Terms "2026"', url: 'https://x.test/terms' },
      { kind: 'quote', lines: ['Seller <Ltd>', '1 Main St'] },
    ],
  }
  const render = async (locale: 'en' | 'pl', email = content) => {
    const i18n = setupI18n()
    await activateLocale(i18n, locale)
    return renderOrderEmail(i18n, email)
  }

  it('renders the parts in order as text, with every link written out', async () => {
    const email = await render('en')

    expect(email.subject).toBe('Order <A&B>')
    expect(email.text).toBe(
      [
        'Thank you & welcome.',
        'YOUR ORDER',
        '2 × <Pin>: 10,00 zł\nTotal: 10,00 zł',
        'The QR code: ABC',
        'See your order: https://x.test/?a=1&b=2',
        'Terms "2026": https://x.test/terms',
        'Seller <Ltd>\n1 Main St',
        'OPOS',
      ].join('\n\n'),
    )
  })

  it('renders the same parts as HTML, each value escaped, the picture by its content id', async () => {
    const { html } = await render('en')

    expect(html).toContain('lang="en"')
    expect(html).toContain('<title>Order &lt;A&amp;B&gt;</title>')
    expect(html).toContain('Thank you &amp; welcome.')
    expect(html).toContain('2 × &lt;Pin&gt;')
    expect(html).toContain('<img src="cid:qr@opos" alt="The QR code"')
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"')
    expect(html).toContain('Terms &quot;2026&quot;')
    expect(html).toContain('Seller &lt;Ltd&gt;<br>1 Main St')
    expect(html).not.toContain('<Pin>')
  })

  it('renders an email of an order in the recipient\u2019s language', async () => {
    const expired = orderExpiredEmail({
      conventionName: 'Pyrkon',
      number: 'ABCDEFGHJK',
      shopLink: 'https://portal.test/shop',
    })

    const email = await render('pl', expired)

    expect(email.subject).toBe('Twoje zamówienie ABCDEFGHJK na Pyrkon wygasło')
    expect(email.text).toContain('Złóż nowe zamówienie: https://portal.test/shop')
    expect(email.html).toContain('lang="pl"')
  })
})
