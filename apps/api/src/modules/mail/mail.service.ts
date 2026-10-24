import { Inject, Injectable } from '@nestjs/common'
import { setupI18n } from '@lingui/core'
import { activateLocale, type Locale } from '@opos/i18n'
import { type EmailContent } from '@opos/i18n/emails'
import { ENV, type Env } from '../../config/env'
import { renderLinkEmail } from './render'
import { sendWithDeadline, smtpOptions } from './smtp'

/**
 * Sends the API's emails over SMTP (Mailpit in dev). Every message is rendered through Lingui in
 * the recipient's locale (PLAN.md 6) and sent within SEND_DEADLINE_MS; a failed or late send
 * rejects, so the caller decides what it means.
 */
@Injectable()
export class MailService {
  private readonly smtp
  private readonly from

  constructor(@Inject(ENV) env: Env) {
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
}
