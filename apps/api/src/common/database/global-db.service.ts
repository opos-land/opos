import { Inject, Injectable } from '@nestjs/common'
import { type EditionListPeriod, type ListedEdition, type PublicProfile } from '@opos/contract'
import {
  accountAvatars,
  accountFiles,
  accountProfiles,
  accounts,
  editionMemberships,
  editions,
  editionShops,
  orderEmails,
  orderLinks,
  orders,
  paymentAttempts,
  scannerDevices,
  programItemLikes,
  programItems,
  tenantLogos,
  tenantMemberships,
  tenants,
  type Database,
  uploadedFiles,
} from '@opos/db'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from 'drizzle-orm'
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core'
import { type TenantInContext, TenantContextService } from '../als/tenant-context.service'
import { isUuid } from '../uuid'
import { GLOBAL_DB } from './tokens'

/**
 * The key of the sweep's advisory lock: below 2^61, apart from the tenants' write locks and the
 * file limits' locks, and above the int4 range of Supabase Auth's keys.
 */
const SWEEP_LOCK_KEY = ((1n << 60n) + 0x5eedn).toString()

/** Whether the tenant of the row is suspended. */
const suspended = () => sql<boolean>`${tenants.suspendedAt} is not null`

/**
 * The only code on the opos_app_global role, which bypasses RLS. Every method is one of the
 * documented cross-tenant queries; a new one is documented first.
 */
/**
 * What one run of a job of the API takes: at most `limit` rows, and with `tenantId` those of one
 * tenant alone, as a test of the job runs it beside the tests of other tenants.
 */
export interface JobScope {
  limit?: number
  tenantId?: string
}

@Injectable()
export class GlobalDbService {
  constructor(
    @Inject(GLOBAL_DB) private readonly db: Database,
    private readonly context: TenantContextService,
  ) {}

  /**
   * Tenant lookup by slug: only the public columns, and whether the tenant is suspended, which
   * the caller answers in its own way, a public route as for an unknown address.
   */
  async tenantBySlug(
    slug: string,
  ): Promise<{ tenant: TenantInContext; suspended: boolean } | undefined> {
    const [row] = await this.db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        defaultLocale: tenants.defaultLocale,
        timezone: tenants.timezone,
        suspended: suspended(),
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
    if (!row) return undefined
    const { suspended: isSuspended, ...tenant } = row
    return { tenant, suspended: isSuspended }
  }

  /**
   * `GET /public/editions`: a page of the list of editions on the portal's home page, bound by
   * publication alone: the published editions of the tenants that are not suspended, with the
   * columns anyone reads of each one convention at a time, and nothing of an account
   * (docs/adr/0043-list-every-published-edition-on-the-portals-home-page.md). The coming editions
   * have not ended and go from the one that starts soonest; the past ones from the last ended.
   * A page continues from the place `after` carries, a moment and an identifier to compare with:
   * nothing is looked up by it, so it answers nothing of an edition that is not listed, and a row
   * published or taken back meanwhile neither repeats nor hides another. The moment orders to the
   * millisecond, as an answer carries it.
   */
  async listedEditions({
    period,
    after,
    limit,
  }: {
    period: EditionListPeriod
    after?: { moment: Date; id: string }
    limit: number
  }): Promise<ListedEdition[]> {
    const coming = period === 'coming'
    const moment = sql`date_trunc('milliseconds', ${coming ? editions.startsAt : editions.endsAt})`
    const place = after && sql`(${after.moment.toISOString()}::timestamptz, ${after.id}::uuid)`
    const rows = await this.db
      .select({
        id: editions.id,
        slug: editions.slug,
        name: editions.name,
        startsAt: editions.startsAt,
        endsAt: editions.endsAt,
        venueCity: editions.venueCity,
        tenant: { slug: tenants.slug, name: tenants.name, timezone: tenants.timezone },
        logo: {
          fileId: tenantLogos.fileId,
          width: uploadedFiles.width,
          height: uploadedFiles.height,
        },
      })
      .from(editions)
      .innerJoin(tenants, eq(tenants.id, editions.tenantId))
      .leftJoin(tenantLogos, eq(tenantLogos.tenantId, tenants.id))
      .leftJoin(uploadedFiles, eq(uploadedFiles.id, tenantLogos.fileId))
      .where(
        and(
          eq(editions.isPublished, true),
          isNull(tenants.suspendedAt),
          coming ? gt(editions.endsAt, sql`now()`) : lte(editions.endsAt, sql`now()`),
          place &&
            (coming
              ? sql`(${moment}, ${editions.id}) > ${place}`
              : sql`(${moment}, ${editions.id}) < ${place}`),
        ),
      )
      .orderBy(...(coming ? [asc(moment), asc(editions.id)] : [desc(moment), desc(editions.id)]))
      .limit(limit)
    return rows.map(({ startsAt, endsAt, tenant, logo, ...row }) => ({
      ...row,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      tenant: {
        ...tenant,
        // A logo is an image, whose file always holds its width and height.
        logo:
          logo?.fileId && logo.width && logo.height
            ? { fileId: logo.fileId, width: logo.width, height: logo.height }
            : null,
      },
    }))
  }

  /**
   * A published profile by its public identifier, for anyone: the parts of its account's public
   * name, what the profile holds and the file of its avatar. Bound by the account's own
   * publication (docs/adr/0071-let-anyone-read-the-profile-an-account-published.md): a profile
   * that is withdrawn or taken down, which the database never holds as published, is not found,
   * and neither the account's identifier nor its email address is read. What it answers is the
   * schema of its route: a field added there is public at once.
   */
  async publishedProfile(publicId: string): Promise<PublicProfile | undefined> {
    const [row] = await this.db
      .select({
        profileId: accountProfiles.publicId,
        firstName: accounts.firstName,
        nickname: accounts.nickname,
        lastName: accounts.lastName,
        nameOrder: accounts.nameOrder,
        avatarFileId: accountAvatars.fileId,
        description: accountProfiles.description,
        pronouns: accountProfiles.pronouns,
        city: accountProfiles.city,
        links: accountProfiles.links,
        interests: accountProfiles.interests,
      })
      .from(accountProfiles)
      .innerJoin(accounts, eq(accounts.id, accountProfiles.accountId))
      .leftJoin(accountAvatars, eq(accountAvatars.accountId, accountProfiles.accountId))
      .where(and(eq(accountProfiles.publicId, publicId), isNotNull(accountProfiles.publishedAt)))
    if (!row) return undefined
    const { avatarFileId, ...profile } = row
    return { ...profile, avatar: avatarFileId ? { fileId: avatarFileId } : null }
  }

  /**
   * The account whose avatar a file is now, for anyone who has the file's identifier: an avatar is
   * public from its upload, whether or not its profile is published. It answers the owner of the
   * file to the storage alone, and nothing of the account to the caller; a file no avatar points
   * at, a replaced or a removed one among them, is not found.
   */
  async avatarOwner(fileId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ accountId: accountAvatars.accountId })
      .from(accountAvatars)
      .where(eq(accountAvatars.fileId, fileId))
    return row?.accountId
  }

  /**
   * `GET /me/schedule`: the signed-in account's liked items in every tenant that is not suspended,
   * only while their edition is published. The id comes from the request store, never from a
   * caller.
   */
  async ownSchedule() {
    const rows = await this.db
      .select({
        id: programItems.id,
        title: programItems.title,
        startsAt: programItems.startsAt,
        endsAt: programItems.endsAt,
        edition: { slug: editions.slug, name: editions.name },
        tenant: { slug: tenants.slug, name: tenants.name, timezone: tenants.timezone },
      })
      .from(programItemLikes)
      .innerJoin(programItems, eq(programItems.id, programItemLikes.programItemId))
      .innerJoin(editions, eq(editions.id, programItems.editionId))
      .innerJoin(tenants, eq(tenants.id, editions.tenantId))
      .where(
        and(
          eq(programItemLikes.accountId, this.context.account().id),
          eq(editions.isPublished, true),
          isNull(tenants.suspendedAt),
        ),
      )
      .orderBy(asc(programItems.startsAt), asc(programItems.title))
    return rows.map(({ startsAt, endsAt, ...row }) => ({
      ...row,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    }))
  }

  /**
   * `GET /me/memberships`: the signed-in account's own, non-expired memberships in every tenant.
   * A suspended tenant says so and lists no edition. The id comes from the request store, never
   * from a caller.
   */
  async ownMemberships() {
    const accountId = this.context.account().id
    const memberships = await this.db
      .select({
        id: tenantMemberships.id,
        tenant: {
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          suspended: suspended(),
        },
        role: tenantMemberships.role,
        settingsAccess: tenantMemberships.settingsAccess,
        brandingAccess: tenantMemberships.brandingAccess,
        shopConfigAccess: tenantMemberships.shopConfigAccess,
        expiresAt: tenantMemberships.expiresAt,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, sql`now()`)),
        ),
      )
      .orderBy(asc(tenants.name))
    if (memberships.length === 0) return []

    const editionRows = await this.db
      .select({
        tenantMembershipId: editionMemberships.tenantMembershipId,
        editionId: editions.id,
        editionSlug: editions.slug,
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editionMemberships)
      .innerJoin(editions, eq(editions.id, editionMemberships.editionId))
      .where(
        inArray(
          editionMemberships.tenantMembershipId,
          memberships.map((m) => m.id),
        ),
      )
      .orderBy(asc(editions.startsAt))

    return memberships.map(({ id, expiresAt, ...membership }) => ({
      ...membership,
      expiresAt: expiresAt?.toISOString() ?? null,
      editions: membership.tenant.suspended
        ? []
        : editionRows
            .filter((row) => row.tenantMembershipId === id)
            .map(({ tenantMembershipId: _, ...edition }) => edition),
    }))
  }

  /**
   * `DELETE /me`: whether the signed-in account is the only head of some tenant. Reads the other
   * heads of the account's own tenants and returns nothing about them but that answer.
   */
  async ownLastHead(): Promise<boolean> {
    const accountId = this.context.account().id
    const otherHead = alias(tenantMemberships, 'other_head')
    const [row] = await this.db
      .select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          eq(tenantMemberships.role, 'head'),
          notExists(
            this.db
              .select({ id: otherHead.id })
              .from(otherHead)
              .where(
                and(
                  eq(otherHead.tenantId, tenantMemberships.tenantId),
                  eq(otherHead.role, 'head'),
                  ne(otherHead.accountId, accountId),
                ),
              ),
          ),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  /**
   * The sweep, the API's own job: the files of a kind older than `before` that the column its
   * kind names does not point at. Identifiers alone, with the tenant a convention's file is in.
   */
  async unpointedFiles(
    kind: { name: string; owner: 'account' | 'convention' | 'edition'; pointer: AnyPgColumn },
    before: Date,
  ): Promise<{ id: string; tenantId: string | null }[]> {
    const pointerTable = kind.pointer.table
    const unpointed = (id: AnyPgColumn) =>
      notExists(
        this.db
          .select({ one: sql`1` })
          .from(pointerTable)
          .where(eq(kind.pointer, id)),
      )
    if (kind.owner === 'account') {
      const rows = await this.db
        .select({ id: accountFiles.id })
        .from(accountFiles)
        .where(
          and(
            eq(accountFiles.kind, kind.name),
            lt(accountFiles.createdAt, before),
            unpointed(accountFiles.id),
          ),
        )
      return rows.map((row) => ({ ...row, tenantId: null }))
    }
    return this.db
      .select({ id: uploadedFiles.id, tenantId: uploadedFiles.tenantId })
      .from(uploadedFiles)
      .where(
        and(
          eq(uploadedFiles.kind, kind.name),
          lt(uploadedFiles.createdAt, before),
          unpointed(uploadedFiles.id),
        ),
      )
  }

  /**
   * The scanner a pairing code belongs to, by the hash of the code: a phone that opens a pairing
   * link names nothing else. It answers the scanner and its tenant alone; whether the code still
   * works is judged in that tenant's transaction.
   */
  async scannerByPairingCode(hash: string): Promise<{ id: string; tenantId: string } | undefined> {
    const [row] = await this.db
      .select({ id: scannerDevices.id, tenantId: scannerDevices.tenantId })
      .from(scannerDevices)
      .where(eq(scannerDevices.pairingCodeHash, hash))
    return row
  }

  /**
   * The scanner a device's token names, by the hash of the token. It answers the scanner and its
   * tenant alone: that the device was not revoked and has not ended, and everything it then
   * reads, come from the tenant's own transaction.
   */
  async scannerByToken(hash: string): Promise<{ id: string; tenantId: string } | undefined> {
    const [row] = await this.db
      .select({ id: scannerDevices.id, tenantId: scannerDevices.tenantId })
      .from(scannerDevices)
      .where(eq(scannerDevices.tokenHash, hash))
    return row
  }

  /**
   * The editions whose reminder may be due around `now`: those that set a number of days, whose
   * reminder has not gone out, published, of tenants not suspended, and starting within the
   * days a reminder may be set to, the soonest first, a page at a time. It answers the
   * identifiers, the tenant's time zone and the place a page continues from alone, the edition's
   * start as the database writes it, so the next page compares with it whole; whether the
   * reminder is due at this hour, and whom it goes to, the tenant's own transaction reads.
   */
  remindersPending(
    now: Date,
    { limit = 100, tenantId, after }: JobScope & { after?: { startsAt: string; id: string } } = {},
  ): Promise<{ tenantId: string; editionId: string; timezone: string; startsAt: string }[]> {
    const DAY = 24 * 60 * 60_000
    return this.db
      .select({
        tenantId: editionShops.tenantId,
        editionId: editionShops.editionId,
        timezone: tenants.timezone,
        startsAt: sql<string>`${editions.startsAt}::text`,
      })
      .from(editionShops)
      .innerJoin(editions, eq(editions.id, editionShops.editionId))
      .innerJoin(tenants, eq(tenants.id, editionShops.tenantId))
      .where(
        and(
          isNotNull(editionShops.reminderDaysBefore),
          isNull(editionShops.reminderSentAt),
          isNull(tenants.suspendedAt),
          eq(editions.isPublished, true),
          gt(editions.startsAt, now),
          lte(editions.startsAt, new Date(now.getTime() + 62 * DAY)),
          tenantId === undefined ? undefined : eq(editionShops.tenantId, tenantId),
          // The page after the last edition of the one before, in the order they are read in.
          after === undefined
            ? undefined
            : sql`(${editions.startsAt}, ${editionShops.editionId}) > (${after.startsAt}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(asc(editions.startsAt), asc(editionShops.editionId))
      .limit(limit)
  }

  /**
   * The tenant of an order link, by the hash of its token: a link's address names nothing else.
   * It answers the tenant alone; the link, its order and whether it still opens are read in that
   * tenant's own transaction.
   */
  async orderLinkTenant(tokenHash: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ tenantId: orderLinks.tenantId })
      .from(orderLinks)
      .where(eq(orderLinks.tokenHash, tokenHash))
    return row?.tenantId
  }

  /**
   * The tenant and the provider of a payment attempt, by its identifier: the address of a
   * provider's notification names nothing else. It answers those two alone, and nothing of the
   * attempt counts before the provider's signature holds, which its tenant's transaction judges.
   */
  async paymentAttempt(id: string): Promise<{ tenantId: string; provider: string } | undefined> {
    if (!isUuid(id)) return undefined
    const [row] = await this.db
      .select({ tenantId: paymentAttempts.tenantId, provider: paymentAttempts.provider })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, id))
    return row
  }

  /**
   * The expiry job: the orders awaiting payment whose hold ended, the longest ended first, of the
   * tenants that are not suspended, a page at a time. Identifiers and the moment a page continues
   * from alone: each order is judged again in its own tenant.
   */
  ordersPastHold(
    now: Date,
    { limit = 200, tenantId, after }: JobScope & { after?: { holdEndsAt: Date; id: string } } = {},
  ): Promise<{ id: string; tenantId: string; holdEndsAt: Date }[]> {
    return this.db
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        holdEndsAt: sql<Date>`${orders.holdEndsAt}`.mapWith(orders.holdEndsAt),
      })
      .from(orders)
      .innerJoin(tenants, eq(tenants.id, orders.tenantId))
      .where(
        and(
          eq(orders.status, 'awaiting-payment'),
          lte(orders.holdEndsAt, now),
          isNull(tenants.suspendedAt),
          tenantId === undefined ? undefined : eq(orders.tenantId, tenantId),
          // The page after the last order of the one before, in the order they are read in.
          after === undefined
            ? undefined
            : sql`(${orders.holdEndsAt}, ${orders.id}) > (${after.holdEndsAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(asc(orders.holdEndsAt), asc(orders.id))
      .limit(limit)
  }

  /**
   * The outbox of the orders' emails: those not sent yet that are due, the longest due first, of
   * the tenants that are not suspended. Identifiers alone: each is taken in its own tenant.
   */
  emailsDue(
    now: Date,
    { limit = 100, tenantId }: JobScope = {},
  ): Promise<{ id: string; tenantId: string }[]> {
    return this.db
      .select({ id: orderEmails.id, tenantId: orderEmails.tenantId })
      .from(orderEmails)
      .innerJoin(tenants, eq(tenants.id, orderEmails.tenantId))
      .where(
        and(
          isNull(orderEmails.sentAt),
          isNull(orderEmails.withdrawnAt),
          lte(orderEmails.nextAttemptAt, now),
          isNull(tenants.suspendedAt),
          tenantId === undefined ? undefined : eq(orderEmails.tenantId, tenantId),
        ),
      )
      .orderBy(asc(orderEmails.nextAttemptAt), asc(orderEmails.id))
      .limit(limit)
  }

  /** The sweep: which of these files have a row, and of what kind. Identifiers alone. */
  async fileKinds(ids: readonly string[]): Promise<Map<string, string>> {
    const kinds = new Map<string, string>()
    // A thousand at a time, within the parameters and the timeout of one statement.
    for (let at = 0; at < ids.length; at += 1000) {
      const batch = ids.slice(at, at + 1000)
      const [tenantFiles, ownFiles] = await Promise.all([
        this.db
          .select({ id: uploadedFiles.id, kind: uploadedFiles.kind })
          .from(uploadedFiles)
          .where(inArray(uploadedFiles.id, batch)),
        this.db
          .select({ id: accountFiles.id, kind: accountFiles.kind })
          .from(accountFiles)
          .where(inArray(accountFiles.id, batch)),
      ])
      for (const row of [...tenantFiles, ...ownFiles]) kinds.set(row.id, row.kind)
    }
    return kinds
  }

  /**
   * Runs `fn` while this process holds the sweep's lock, a session-level advisory lock on a
   * connection of its own, so one of several API processes sweeps at a time; another finds it held
   * and answers null without waiting.
   */
  async whileSweepLocked<T>(fn: () => Promise<T>): Promise<T | null> {
    const connection = await this.db.$client.reserve()
    try {
      const [row] = await connection<{ locked: boolean }[]>`
        select pg_try_advisory_lock(${SWEEP_LOCK_KEY}::bigint) as locked
      `
      if (!row?.locked) return null
      try {
        return await fn()
      } finally {
        await connection`select pg_advisory_unlock(${SWEEP_LOCK_KEY}::bigint)`
      }
    } finally {
      connection.release()
    }
  }
}
