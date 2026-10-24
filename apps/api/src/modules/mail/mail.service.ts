import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { setupI18n } from '@lingui/core'
import { activateLocale, type Locale } from '@opos/i18n'
import { type EmailContent } from '@opos/i18n/emails'
import { createTransport } from 'nodemailer'
import { ENV, type Env } from '../../config/env'
import { renderLinkEmail } from './render'
import { smtpOptions } from './smtp'

/**
 * Sends the API's emails over SMTP (Mailpit in dev). Every message is rendered through Lingui in
 * the recipient's locale (PLAN.md 6); a failed send rejects, so the caller decides what it means.
 */
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly transport

  constructor(@Inject(ENV) env: Env) {
    this.transport = createTransport(smtpOptions(env), { from: env.MAIL_FROM })
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
    await this.transport.sendMail({ to: message.to, subject, text, html })
  }

  onApplicationShutdown() {
    this.transport.close()
  }
}
