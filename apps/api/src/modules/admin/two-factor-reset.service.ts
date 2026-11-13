import { Injectable, Logger } from '@nestjs/common'
import { mfaDisabledEmail } from '@opos/i18n/emails'
import { AuthAdminClient } from '../auth/auth-admin.client'
import { mailFailure } from '../mail/mail-failure'
import { MailService } from '../mail/mail.service'
import { AdminDbService } from './admin-db.service'

/**
 * The reset of an account's two-factor authentication by an admin, for a person who lost both the
 * device and the recovery codes: the factors and the unused codes go, and the account gets the
 * notice. Never an admin's own. Nothing the person could use to sign in is logged. It ends no
 * session: Supabase Auth's admin API ends one only with that session's own token.
 */
@Injectable()
export class TwoFactorResetService {
  private readonly logger = new Logger(TwoFactorResetService.name)

  constructor(
    private readonly admin: AdminDbService,
    private readonly auth: AuthAdminClient,
    private readonly mail: MailService,
  ) {}

  /** `emailSent` is false when the notice failed; the reset stands, and the admin tells the person. */
  async reset(address: string, adminAccountId: string): Promise<{ emailSent: boolean }> {
    // The refusals and the entry of the log, committed before anything acts in Supabase Auth.
    // No transaction spans the two: an account granted the admin role between this check and the
    // removal below is reset all the same, and its grant, bound to the factor that went, opens
    // nothing until a new one.
    const account = await this.admin.beginTwoFactorReset(address, adminAccountId)

    for (const factorId of await this.auth.factorIds(account.id)) {
      await this.auth.deleteFactor(account.id, factorId)
    }
    // The factors are gone, so the person hears of it whatever the codes do: they work only with
    // a factor, and the next enrolment replaces them.
    try {
      await this.admin.deleteUnusedRecoveryCodes(account.id)
    } catch (error) {
      this.logger.error(
        `The unused recovery codes of ${account.id} stayed after a reset: ${mailFailure(error)}`,
      )
    }
    try {
      await this.mail.sendNoticeEmail({
        to: account.email,
        locale: await this.auth.noticeLocale(account),
        content: mfaDisabledEmail,
      })
      return { emailSent: true }
    } catch (error) {
      this.logger.error(`The notice of a two-factor reset was not sent: ${mailFailure(error)}`)
      return { emailSent: false }
    }
  }
}
