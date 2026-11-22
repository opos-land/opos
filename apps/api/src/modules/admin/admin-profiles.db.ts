import { Injectable } from '@nestjs/common'
import {
  type AdminProfile,
  type AdminProfileReport,
  type ListedProfileReport,
  type TakeDownProfile,
  type TakedownReason,
  type TakenDownProfile,
} from '@opos/contract'
import {
  accountAvatars,
  accountProfiles,
  accounts,
  profileReports,
  recordAdminAction,
} from '@opos/db'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { ApiError, notFound } from '../../common/errors/api-error'
import { AdminDbService } from './admin-db.service'

const reportColumns = {
  id: profileReports.id,
  accountId: profileReports.accountId,
  reason: profileReports.reason,
  note: profileReports.note,
  email: profileReports.email,
  createdAt: profileReports.createdAt,
  closedAt: profileReports.closedAt,
}

type ReportRow = { [K in keyof typeof reportColumns]: (typeof profileReports.$inferSelect)[K] }

const toReport = ({ createdAt, closedAt, ...row }: ReportRow): AdminProfileReport => ({
  ...row,
  createdAt: createdAt.toISOString(),
  closedAt: closedAt?.toISOString() ?? null,
})

const nameColumns = {
  firstName: accounts.firstName,
  nickname: accounts.nickname,
  lastName: accounts.lastName,
  nameOrder: accounts.nameOrder,
}

/** The account an email about an action goes to. */
export interface Recipient {
  id: string
  email: string
  locale: string | null
}

/** Who sent a report and gave an address: where the outcome goes, and in which language. */
export interface Reporter {
  email: string
  locale: string
}

const reporterOf = (row: { email: string | null; locale: string | null }): Reporter[] =>
  row.email && row.locale ? [{ email: row.email, locale: row.locale }] : []

/**
 * What the admin reads and changes of the public profile (docs/specs/0016-public-profile.md,
 * T1-T14), on the opos_admin role. Every method that changes anything locks the row it changes
 * and writes its entry of the log in the same transaction; one that finds nothing to change
 * writes no entry and says so, for no email to go out. The admin changes nothing a profile says:
 * the role holds no such column.
 */
@Injectable()
export class AdminProfilesDb {
  constructor(private readonly admin: AdminDbService) {}

  private get db() {
    return this.admin.connection
  }

  /** The reports, open or closed, newest first: a page of `limit` older than `before`. */
  async reports(page: {
    state: 'open' | 'closed'
    before?: string
    limit: number
  }): Promise<ListedProfileReport[]> {
    const rows = await this.db
      .select({ ...reportColumns, account: nameColumns })
      .from(profileReports)
      .innerJoin(accounts, eq(accounts.id, profileReports.accountId))
      .where(
        and(
          page.state === 'open'
            ? isNull(profileReports.closedAt)
            : isNotNull(profileReports.closedAt),
          page.before
            ? sql`(${profileReports.createdAt}, ${profileReports.id}) < (
                select created_at, id from profile_reports where id = ${page.before}
              )`
            : undefined,
        ),
      )
      .orderBy(desc(profileReports.createdAt), desc(profileReports.id))
      .limit(page.limit)
    return rows.map(({ account, ...row }) => ({ ...toReport(row), account }))
  }

  async report(id: string): Promise<AdminProfileReport> {
    const [row] = await this.db
      .select(reportColumns)
      .from(profileReports)
      .where(eq(profileReports.id, id))
    if (!row) throw notFound('report')
    return toReport(row)
  }

  /** Closes a report; one closed already stays as it is, with nobody left to tell. */
  async closeReport(id: string, adminAccountId: string) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ ...reportColumns, locale: profileReports.locale })
        .from(profileReports)
        .where(eq(profileReports.id, id))
        .for('update')
      if (!current) throw notFound('report')
      const { locale, ...row } = current
      if (row.closedAt) return { report: toReport(row), changed: false, reporters: [] }
      const [closed] = await tx
        .update(profileReports)
        .set({ closedAt: sql`now()` })
        .where(eq(profileReports.id, id))
        .returning(reportColumns)
      await recordAdminAction(tx, {
        action: 'profile-report.close',
        adminAccountId,
        accountId: row.accountId,
      })
      return {
        report: toReport(closed!),
        changed: true,
        reporters: reporterOf({ email: row.email, locale }),
      }
    })
  }

  /** The profiles taken down: those asking for a review first, the longest waiting on top. */
  async takenDown(): Promise<TakenDownProfile[]> {
    const rows = await this.db
      .select({
        accountId: accounts.id,
        email: accounts.email,
        ...nameColumns,
        avatarFileId: accountAvatars.fileId,
        takenDownAt: accountProfiles.takenDownAt,
        reason: accountProfiles.takenDownReason,
        reviewRequestedAt: accountProfiles.reviewRequestedAt,
      })
      .from(accountProfiles)
      .innerJoin(accounts, eq(accounts.id, accountProfiles.accountId))
      .leftJoin(accountAvatars, eq(accountAvatars.accountId, accountProfiles.accountId))
      .where(isNotNull(accountProfiles.takenDownAt))
      .orderBy(
        sql`${accountProfiles.reviewRequestedAt} is null`,
        asc(accountProfiles.reviewRequestedAt),
        desc(accountProfiles.takenDownAt),
      )
      .limit(200)
    return rows.map(({ avatarFileId, takenDownAt, reason, reviewRequestedAt, ...row }) => ({
      ...row,
      avatar: avatarFileId ? { fileId: avatarFileId } : null,
      // The query lists a takedown alone, which the database holds only with its reason.
      takenDownAt: takenDownAt!.toISOString(),
      reason: reason as TakedownReason,
      reviewRequestedAt: reviewRequestedAt?.toISOString() ?? null,
    }))
  }

  /**
   * The account an email address names, by its identifier alone. As in every lookup by email, the
   * address leads to an account only once confirmed: an account someone made under another
   * person's address is not opened by it, and no email about it goes to that person.
   */
  async findAccount(address: string): Promise<string> {
    const [account] = await this.db
      .select({ id: accounts.id, emailConfirmedAt: accounts.emailConfirmedAt })
      .from(accounts)
      .where(eq(accounts.email, address.trim().toLowerCase()))
    if (!account) throw new ApiError(404, 'account.not-found', 'No account uses this email address')
    if (!account.emailConfirmedAt) {
      throw new ApiError(409, 'account.unconfirmed', 'The email address is not confirmed')
    }
    return account.id
  }

  /** The profile of an account as it is now, with its reports; an empty one for an account with none. */
  async profile(accountId: string): Promise<AdminProfile> {
    const [row] = await this.db
      .select({
        accountId: accounts.id,
        email: accounts.email,
        ...nameColumns,
        publicId: accountProfiles.publicId,
        publishedAt: accountProfiles.publishedAt,
        takenDownAt: accountProfiles.takenDownAt,
        takenDownReason: accountProfiles.takenDownReason,
        takenDownNote: accountProfiles.takenDownNote,
        takenDownAfterReport: accountProfiles.takenDownAfterReport,
        reviewRequestedAt: accountProfiles.reviewRequestedAt,
        description: accountProfiles.description,
        pronouns: accountProfiles.pronouns,
        city: accountProfiles.city,
        links: accountProfiles.links,
        interests: accountProfiles.interests,
        avatarFileId: accountAvatars.fileId,
      })
      .from(accounts)
      .leftJoin(accountProfiles, eq(accountProfiles.accountId, accounts.id))
      .leftJoin(accountAvatars, eq(accountAvatars.accountId, accounts.id))
      .where(eq(accounts.id, accountId))
    if (!row) throw notFound('account')
    const reports = await this.db
      .select(reportColumns)
      .from(profileReports)
      .where(eq(profileReports.accountId, accountId))
      .orderBy(desc(profileReports.createdAt), desc(profileReports.id))
      .limit(100)
    return {
      accountId: row.accountId,
      email: row.email,
      firstName: row.firstName,
      nickname: row.nickname,
      lastName: row.lastName,
      nameOrder: row.nameOrder,
      exists: row.publicId !== null,
      profileId: row.publishedAt ? row.publicId : null,
      published: row.publishedAt !== null,
      avatar: row.avatarFileId ? { fileId: row.avatarFileId } : null,
      takedown: row.takenDownAt
        ? {
            at: row.takenDownAt.toISOString(),
            reason: row.takenDownReason as TakedownReason,
            note: row.takenDownNote,
            afterReport: row.takenDownAfterReport === true,
            reviewRequested: row.reviewRequestedAt !== null,
          }
        : null,
      description: row.description,
      pronouns: row.pronouns,
      city: row.city,
      links: row.links ?? [],
      interests: row.interests ?? [],
      reports: reports.map(toReport),
    }
  }

  private async recipient(
    tx: { select: AdminProfilesDb['db']['select'] },
    accountId: string,
  ): Promise<Recipient | undefined> {
    const [account] = await tx
      .select({ id: accounts.id, email: accounts.email, locale: accounts.locale })
      .from(accounts)
      .where(eq(accounts.id, accountId))
    return account
  }

  /**
   * Takes a profile down: it is withdrawn and cannot be published, its avatar goes and its open
   * reports are closed, all at once. The avatar's file stays a file nothing points at, which the
   * sweep removes; its address answers nothing from this moment.
   */
  async takeDown(accountId: string, takedown: TakeDownProfile, adminAccountId: string) {
    return this.db.transaction(async (tx) => {
      const account = await this.recipient(tx, accountId)
      const [current] = await tx
        .select({ takenDownAt: accountProfiles.takenDownAt })
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, accountId))
        .for('update')
      if (!account || !current) throw notFound('profile')
      if (current.takenDownAt) {
        return { changed: false, account, afterReport: false, reporters: [] as Reporter[] }
      }
      const closed = await tx
        .update(profileReports)
        .set({ closedAt: sql`now()` })
        .where(and(eq(profileReports.accountId, accountId), isNull(profileReports.closedAt)))
        .returning({ email: profileReports.email, locale: profileReports.locale })
      await tx.delete(accountAvatars).where(eq(accountAvatars.accountId, accountId))
      await tx
        .update(accountProfiles)
        .set({
          publishedAt: null,
          takenDownAt: sql`now()`,
          takenDownReason: takedown.reason,
          takenDownNote: takedown.note ?? null,
          takenDownAfterReport: closed.length > 0,
        })
        .where(eq(accountProfiles.accountId, accountId))
      await recordAdminAction(tx, { action: 'profile.take-down', adminAccountId, accountId })
      return {
        changed: true,
        account,
        afterReport: closed.length > 0,
        reporters: closed.flatMap(reporterOf),
      }
    })
  }

  /** Restores a profile taken down: its account may publish it again; nothing is published here. */
  async restore(accountId: string, adminAccountId: string) {
    return this.db.transaction(async (tx) => {
      const account = await this.recipient(tx, accountId)
      const [current] = await tx
        .select({ takenDownAt: accountProfiles.takenDownAt })
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, accountId))
        .for('update')
      if (!account || !current) throw notFound('profile')
      if (!current.takenDownAt) return { changed: false, account }
      await tx
        .update(accountProfiles)
        .set({
          takenDownAt: null,
          takenDownReason: null,
          takenDownNote: null,
          takenDownAfterReport: null,
          reviewRequestedAt: null,
        })
        .where(eq(accountProfiles.accountId, accountId))
      await recordAdminAction(tx, { action: 'profile.restore', adminAccountId, accountId })
      return { changed: true, account }
    })
  }

  /** Clears the three parts of an account's name; an account with none of them stays as it is. */
  async clearName(accountId: string, adminAccountId: string) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: accounts.id,
          email: accounts.email,
          locale: accounts.locale,
          firstName: accounts.firstName,
          nickname: accounts.nickname,
          lastName: accounts.lastName,
        })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update')
      if (!current) throw notFound('account')
      const { firstName, nickname, lastName, ...account } = current
      if (firstName === null && nickname === null && lastName === null) {
        return { changed: false, account }
      }
      await tx
        .update(accounts)
        .set({ firstName: null, nickname: null, lastName: null })
        .where(eq(accounts.id, accountId))
      await recordAdminAction(tx, { action: 'account.clear-name', adminAccountId, accountId })
      return { changed: true, account }
    })
  }
}
