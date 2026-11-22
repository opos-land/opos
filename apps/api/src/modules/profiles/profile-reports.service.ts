import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { type ReportProfile } from '@opos/contract'
import { type Database } from '@opos/db'
import { type Locale } from '@opos/i18n'
import { sql } from 'drizzle-orm'
import { APP_DB } from '../../common/database/tokens'

/**
 * How many open reports a profile holds: one sent beyond that is answered like any other and is
 * not kept (docs/specs/0016-public-profile.md, R4).
 */
export const MAX_OPEN_PROFILE_REPORTS = 20

/** How often the job that removes old reports runs, and how long after the start it first does. */
const CLEAN_EVERY_MS = 24 * 60 * 60 * 1000
const FIRST_CLEAN_MS = 15 * 60 * 1000

/**
 * The reports of profiles as the API holds them: it adds one and removes an old one, and reads
 * nothing a report says, which the database grants it no column of. Only an admin reads a report.
 */
@Injectable()
export class ProfileReportsRepository {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  /**
   * Keeps a report of the published profile a public identifier names, in one statement: whether
   * the profile is there, whether it has room for another open report and the report itself. A
   * profile that is not published is not found, as its page is not; one that holds its limit of
   * open reports keeps none, and the caller answers as if it had. The language is kept with the
   * email address alone: it is the language the address is answered in.
   */
  async add(
    publicId: string,
    report: ReportProfile,
    locale: Locale,
  ): Promise<'kept' | 'full' | 'not-found'> {
    const [row] = await this.db.execute<{ found: number; kept: number }>(sql`
      with target as (
        select account_id from account_profiles
        where public_id = ${publicId}::uuid and published_at is not null
      ), kept as (
        insert into profile_reports (account_id, reason, note, email, locale)
        select
          target.account_id,
          ${report.reason}::profile_report_reason,
          ${report.note ?? null}::text,
          ${report.email ?? null}::text,
          ${report.email ? locale : null}::text
        from target
        where (
          select count(*) from profile_reports reported
          where reported.account_id = target.account_id and reported.closed_at is null
        ) < ${MAX_OPEN_PROFILE_REPORTS}
        returning 1
      )
      select
        (select count(*) from target)::int as found,
        (select count(*) from kept)::int as kept
    `)
    if (!row?.found) return 'not-found'
    return row.kept ? 'kept' : 'full'
  }

  /** Removes every report closed more than twelve months ago (R9) and answers how many went. */
  async removeOld(): Promise<number> {
    const [row] = await this.db.execute<{ removed: number }>(sql`
      with gone as (
        delete from profile_reports where closed_at < now() - interval '12 months' returning 1
      )
      select count(*)::int as removed from gone
    `)
    return row?.removed ?? 0
  }
}

/**
 * A job of the API: once a day it removes the reports closed more than twelve months ago, each
 * with the email address it gave. Run twice, or by two processes at once, it removes the same
 * rows once.
 */
@Injectable()
export class ProfileReportsCleanup implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProfileReportsCleanup.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly reports: ProfileReportsRepository) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    const run = () => {
      this.clean().catch((error: unknown) =>
        this.logger.error(`Removing the old reports of profiles failed: ${String(error)}`),
      )
      this.timer = setTimeout(run, CLEAN_EVERY_MS).unref()
    }
    this.timer = setTimeout(run, FIRST_CLEAN_MS).unref()
  }

  onApplicationShutdown() {
    clearTimeout(this.timer)
  }

  /** One run: how many reports it removed. */
  clean(): Promise<number> {
    return this.reports.removeOld()
  }
}
