import { Inject, Injectable } from '@nestjs/common'
import { type MyProfile, type ProfileContent, type TakedownReason } from '@opos/contract'
import { accountAvatars, accountProfiles, type Database } from '@opos/db'
import { eq, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { APP_DB } from '../../common/database/tokens'
import { profileNotTakenDown, profileTakenDown } from './errors'

const columns = {
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
}

type Row = Awaited<ReturnType<MyProfileRepository['row']>>

/** An account with no row yet has an empty, private profile. */
const toProfile = (row: Row): MyProfile => ({
  // What the address of the profile's page holds, known to the account only while it has a page.
  profileId: row?.publishedAt ? row.publicId : null,
  published: row?.publishedAt != null,
  avatar: row?.avatarFileId ? { fileId: row.avatarFileId } : null,
  takedown: row?.takenDownAt
    ? {
        at: row.takenDownAt.toISOString(),
        // The database holds a takedown only with its reason, and never with "other".
        reason: row.takenDownReason as TakedownReason,
        note: row.takenDownNote,
        afterReport: row.takenDownAfterReport === true,
        reviewRequested: row.reviewRequestedAt !== null,
      }
    : null,
  description: row?.description ?? null,
  pronouns: row?.pronouns ?? null,
  city: row?.city ?? null,
  links: row?.links ?? [],
  interests: row?.interests ?? [],
})

/**
 * The profile of the session's account (docs/specs/0016-public-profile.md). `account_profiles`
 * has no RLS: every query names the account in the request store, so no caller can pass another
 * account's id. The writes run in the account's own transaction, on a row locked for its length;
 * the API gives the row no public identifier, sets nothing a takedown sets and never deletes it.
 */
@Injectable()
export class MyProfileRepository {
  constructor(
    @Inject(APP_DB) private readonly db: Database,
    private readonly context: TenantContextService,
  ) {}

  private accountId() {
    return this.context.account().id
  }

  private async row() {
    const executor = TenantContextService.peek()?.accountTx ?? this.db
    const [row] = await executor
      .select(columns)
      .from(accountProfiles)
      .leftJoin(accountAvatars, eq(accountAvatars.accountId, accountProfiles.accountId))
      .where(eq(accountProfiles.accountId, this.accountId()))
    return row
  }

  /** The profile as the account sees it; inside the account's transaction, as that leaves it. */
  async find(): Promise<MyProfile> {
    return toProfile(await this.row())
  }

  /**
   * The row of the account, made on the first change of its profile, locked until the
   * transaction ends: a takedown that lands meanwhile waits, and the next change sees it.
   */
  private async lock() {
    const tx = this.context.accountTx()
    const accountId = this.accountId()
    // The statement names its one column: the row takes its public identifier from the database,
    // and opos_app may give neither that nor what a takedown sets.
    await tx.execute(
      sql`insert into account_profiles (account_id) values (${accountId}) on conflict do nothing`,
    )
    const [row] = await tx
      .select({ takenDownAt: accountProfiles.takenDownAt })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, accountId))
      .for('update')
    return row!
  }

  async setContent(content: ProfileContent) {
    await this.lock()
    await this.context
      .accountTx()
      .update(accountProfiles)
      .set(content)
      .where(eq(accountProfiles.accountId, this.accountId()))
  }

  /** Publishes the profile; one already published keeps the moment it was. */
  async publish() {
    if ((await this.lock()).takenDownAt) throw profileTakenDown()
    await this.context
      .accountTx()
      .update(accountProfiles)
      .set({ publishedAt: sql`coalesce(${accountProfiles.publishedAt}, now())` })
      .where(eq(accountProfiles.accountId, this.accountId()))
  }

  /** Withdraws the profile, which keeps what it holds; an account with none has nothing to withdraw. */
  async withdraw() {
    await this.context
      .accountTx()
      .update(accountProfiles)
      .set({ publishedAt: null })
      .where(eq(accountProfiles.accountId, this.accountId()))
  }

  /** Asks for a review of the takedown; a second request keeps the moment of the first. */
  async requestReview() {
    const tx = this.context.accountTx()
    const [row] = await tx
      .select({ takenDownAt: accountProfiles.takenDownAt })
      .from(accountProfiles)
      .where(eq(accountProfiles.accountId, this.accountId()))
      .for('update')
    if (!row?.takenDownAt) throw profileNotTakenDown()
    await tx
      .update(accountProfiles)
      .set({ reviewRequestedAt: sql`coalesce(${accountProfiles.reviewRequestedAt}, now())` })
      .where(eq(accountProfiles.accountId, this.accountId()))
  }

  /** Removes the pointer at the avatar and answers the file it pointed at, for the caller to release. */
  async clearAvatar(): Promise<string | undefined> {
    const [gone] = await this.context
      .accountTx()
      .delete(accountAvatars)
      .where(eq(accountAvatars.accountId, this.accountId()))
      .returning({ fileId: accountAvatars.fileId })
    return gone?.fileId
  }

  /** Points the avatar at a file just kept; the account has none at that moment. */
  async setAvatar(fileId: string) {
    await this.lock()
    await this.context
      .accountTx()
      .insert(accountAvatars)
      .values({ accountId: this.accountId(), fileId })
  }
}
