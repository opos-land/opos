import { Injectable, Logger } from '@nestjs/common'
import { type Locale } from '@opos/i18n'
import { type NoticeContent, profileReportReceivedEmail } from '@opos/i18n/emails'
import { mailFailure } from '../mail/mail-failure'
import { MailService } from '../mail/mail.service'

/**
 * The emails of the public profile (docs/specs/0016-public-profile.md): each tells of something
 * that already happened and stands whether or not its email goes out, so a failed send is logged,
 * without the address, and answered as not sent.
 */
@Injectable()
export class ProfileNotices {
  private readonly logger = new Logger(ProfileNotices.name)

  constructor(private readonly mail: MailService) {}

  /** Sends a notice and answers whether it went out. */
  async send(to: string, locale: Locale, content: NoticeContent): Promise<boolean> {
    try {
      await this.mail.sendNoticeEmail({ to, locale, content })
      return true
    } catch (error) {
      this.logger.error(`A notice about a profile was not sent: ${mailFailure(error)}`)
      return false
    }
  }

  /** To the address a report gave: the report arrived, in the words of OPOS alone (R7, R8). */
  reportReceived(to: string, locale: Locale) {
    return this.send(to, locale, profileReportReceivedEmail)
  }
}
