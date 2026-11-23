import { Inject, Injectable } from '@nestjs/common'
import { setupI18n } from '@lingui/core'
import { activateLocale, type Locale } from '@opos/i18n'
import { type EmailContent, type NoticeContent } from '@opos/i18n/emails'
import { type OrderEmailContent } from '@opos/i18n/order-emails'
import { ENV, type Env } from '../../config/env'
import { renderLinkEmail, renderNoticeEmail, renderOrderEmail } from './render'
import { sendWithDeadline, smtpOptions } from './smtp'

/** What sending takes of the environment. */
export type MailEnv = Pick<
  Env,
  'OPOS_ENV' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS' | 'MAIL_FROM'
>

/**
 * Sends the API's emails over SMTP (Mailpit in dev). Every message is rendered through Lingui in
 * the recipient's locale and sent within SEND_DEADLINE_MS; a failed or late send
 * rejects, so the caller decides what it means.
 */
@Injectable()
export class MailService {
  private readonly smtp
  private readonly from

  constructor(@Inject(ENV) env: MailEnv) {
    this.smtp = smtpOptions(env)
    this.from = env.MAIL_FROM
  }

  /** Renders an email built around one link in `locale` and sends it to `to`. */
  async sendLinkEmail(message: {
    to: string
    locale: Locale
    content: EmailContent
    link: string
  }) {
    const i18n = setupI18n()
    await activateLocale(i18n, message.locale)
    const { subject, text, html } = renderLinkEmail(i18n, message.content, message.link)
    await sendWithDeadline(this.smtp, this.from, { to: message.to, subject, text, html })
  }

  /** Renders a notice with no link in `locale` and sends it to `to`. */
  async sendNoticeEmail(message: { to: string; locale: Locale; content: NoticeContent }) {
    const i18n = setupI18n()
    await activateLocale(i18n, message.locale)
    const { subject, text, html } = renderNoticeEmail(i18n, message.content)
    await sendWithDeadline(this.smtp, this.from, { to: message.to, subject, text, html })
  }

  /**
   * Renders an email of an order in `locale` and sends it to `to`. Its pictures travel with it,
   * each under the content id a part names: an email client loads nothing from another address.
   */
  async sendOrderEmail(message: {
    to: string
    locale: Locale
    content: OrderEmailContent
    pictures?: readonly { cid: string; filename: string; content: Buffer }[]
  }) {
    const i18n = setupI18n()
    await activateLocale(i18n, message.locale)
    const { subject, text, html } = renderOrderEmail(i18n, message.content)
    await sendWithDeadline(this.smtp, this.from, {
      to: message.to,
      subject,
      text,
      html,
      attachments: message.pictures?.map((picture) => ({
        ...picture,
        contentType: 'image/png',
        contentDisposition: 'inline' as const,
      })),
    })
  }

  /**
   * An email of an order as its subject and its text alone, in `locale`, and sent nowhere: what
   * is kept of an email is written apart from the one that goes out.
   */
  async orderEmailText(message: { locale: Locale; content: OrderEmailContent }) {
    const i18n = setupI18n()
    await activateLocale(i18n, message.locale)
    const { subject, text } = renderOrderEmail(i18n, message.content)
    return { subject, text }
  }
}
