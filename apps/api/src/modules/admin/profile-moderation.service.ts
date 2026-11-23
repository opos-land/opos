import { Injectable } from '@nestjs/common'
import {
  CONTACT_EMAIL,
  type ModeratedProfile,
  type TakeDownProfile,
  type TakedownReason,
} from '@opos/contract'
import { DEFAULT_LOCALE, isLocale } from '@opos/i18n'
import {
  nameClearedEmail,
  type NoticeContent,
  profileReportOutcomeEmail,
  profileRestoredEmail,
  profileTakenDownEmail,
} from '@opos/i18n/emails'
import { AuthAdminClient } from '../auth/auth-admin.client'
import { ProfileNotices } from '../profiles/profile-notices.service'
import { AdminProfilesDb, type Recipient, type Reporter } from './admin-profiles.db'

/**
 * What an admin does about a profile, and who hears of it (docs/specs/0016-public-profile.md,
 * T3-T12). The change and its entry of the log commit first, in one transaction; the emails go
 * out after it and outside it, so one that fails leaves the decision standing, and the answer
 * says that it was not sent. An action that changed nothing sends none.
 */
@Injectable()
export class ProfileModerationService {
  constructor(
    private readonly profiles: AdminProfilesDb,
    private readonly auth: AuthAdminClient,
    private readonly notices: ProfileNotices,
  ) {}

  /** Tells the account, in its own language. */
  private async tell(account: Recipient, content: NoticeContent) {
    return this.notices.send(account.email, await this.auth.noticeLocale(account), content)
  }

  /** Tells who sent a report, in the language of the page the report came from. */
  private tellReporter({ email, locale }: Reporter, outcome: 'taken-down' | 'closed') {
    return this.notices.send(
      email,
      isLocale(locale) ? locale : DEFAULT_LOCALE,
      profileReportOutcomeEmail(outcome, CONTACT_EMAIL),
    )
  }

  async closeReport(reportId: string, adminAccountId: string) {
    const { report, reporters } = await this.profiles.closeReport(reportId, adminAccountId)
    const [reporter] = reporters
    return { report, emailSent: reporter ? await this.tellReporter(reporter, 'closed') : null }
  }

  async takeDown(
    accountId: string,
    takedown: TakeDownProfile,
    adminAccountId: string,
  ): Promise<ModeratedProfile> {
    const done = await this.profiles.takeDown(accountId, takedown, adminAccountId)
    let emailSent: boolean | null = null
    if (done.changed) {
      emailSent = await this.tell(
        done.account,
        profileTakenDownEmail({
          reason: takedown.reason,
          afterReport: done.afterReport,
          note: takedown.note ?? null,
          contact: CONTACT_EMAIL,
        }),
      )
      for (const reporter of done.reporters) await this.tellReporter(reporter, 'taken-down')
    }
    return { profile: await this.profiles.profile(accountId), emailSent }
  }

  async restore(accountId: string, adminAccountId: string): Promise<ModeratedProfile> {
    const done = await this.profiles.restore(accountId, adminAccountId)
    const emailSent = done.changed ? await this.tell(done.account, profileRestoredEmail) : null
    return { profile: await this.profiles.profile(accountId), emailSent }
  }

  async clearName(
    accountId: string,
    reason: TakedownReason,
    adminAccountId: string,
  ): Promise<ModeratedProfile> {
    const done = await this.profiles.clearName(accountId, adminAccountId)
    const emailSent = done.changed
      ? await this.tell(done.account, nameClearedEmail({ reason, contact: CONTACT_EMAIL }))
      : null
    return { profile: await this.profiles.profile(accountId), emailSent }
  }
}
