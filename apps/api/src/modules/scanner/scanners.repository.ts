import { Injectable } from '@nestjs/common'
import { type Scanner } from '@opos/contract'
import { accounts, editions, scannerDevices, tenantMemberships, tenants } from '@opos/db'
import { and, asc, count, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

const columns = {
  id: scannerDevices.id,
  name: scannerDevices.name,
  enabledBy: accounts.email,
  pairedAt: scannerDevices.pairedAt,
  lastUsedAt: scannerDevices.lastUsedAt,
  expiresAt: scannerDevices.expiresAt,
  revokedAt: scannerDevices.revokedAt,
}

type Row = Omit<Scanner, 'paired' | 'lastUsedAt' | 'expiresAt' | 'revokedAt'> & {
  pairedAt: Date | null
  lastUsedAt: Date | null
  expiresAt: Date
  revokedAt: Date | null
}

const toScanner = ({ pairedAt, ...row }: Row): Scanner => ({
  ...row,
  paired: pairedAt !== null,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  expiresAt: row.expiresAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
})

/** A scanner that stands, as a request made with its token reads it. */
export interface StandingScanner {
  id: string
  tenantId: string
  editionId: string
  name: string
}

/**
 * The scanners of the tenant of the open transaction (docs/specs/0007-scanner.md). RLS keeps
 * every query inside it. An org's routes look a scanner up within the edition of the path, whose
 * permission the request was checked against. A device's requests come with no tenant in
 * context: the transaction is one opened for the tenant its token named, so the reads that
 * decide what the device may do filter on that tenant themselves.
 */
@Injectable()
export class ScannersRepository {
  constructor(private readonly context: TenantContextService) {}

  private listed() {
    return this.context
      .tx()
      .select(columns)
      .from(scannerDevices)
      .leftJoin(tenantMemberships, eq(tenantMemberships.id, scannerDevices.enabledByMembershipId))
      .leftJoin(accounts, eq(accounts.id, tenantMemberships.accountId))
  }

  /** The edition's scanners: those that are not revoked first, each group by name. */
  async list(editionId: string): Promise<Scanner[]> {
    const rows = await this.listed()
      .where(eq(scannerDevices.editionId, editionId))
      .orderBy(
        sql`(${scannerDevices.revokedAt} is not null)`,
        asc(scannerDevices.name),
        asc(scannerDevices.id),
      )
    return rows.map(toScanner)
  }

  /** The scanner of the edition, or 404. */
  async get(editionId: string, id: string): Promise<Scanner> {
    if (!isUuid(id)) throw notFound('scanner')
    const [row] = await this.listed().where(
      and(eq(scannerDevices.editionId, editionId), eq(scannerDevices.id, id)),
    )
    if (!row) throw notFound('scanner')
    return toScanner(row)
  }

  /** When the edition ends, or undefined. */
  async editionEnd(editionId: string): Promise<Date | undefined> {
    const [row] = await this.context
      .tx()
      .select({ endsAt: editions.endsAt })
      .from(editions)
      .where(eq(editions.id, editionId))
    return row?.endsAt
  }

  /** How many scanners of the edition are enabled: not revoked, and not ended. */
  async enabled(editionId: string, now: Date): Promise<number> {
    const [row] = await this.context
      .tx()
      .select({ enabled: count() })
      .from(scannerDevices)
      .where(
        and(
          eq(scannerDevices.editionId, editionId),
          isNull(scannerDevices.revokedAt),
          gt(scannerDevices.expiresAt, now),
        ),
      )
    return row!.enabled
  }

  /** Whether a scanner of the edition that is not revoked has the name. */
  async nameTaken(editionId: string, name: string): Promise<boolean> {
    const [row] = await this.context
      .tx()
      .select({ id: scannerDevices.id })
      .from(scannerDevices)
      .where(
        and(
          eq(scannerDevices.editionId, editionId),
          eq(scannerDevices.name, name),
          isNull(scannerDevices.revokedAt),
        ),
      )
    return row !== undefined
  }

  async insert(values: typeof scannerDevices.$inferInsert): Promise<string> {
    const [row] = await this.context
      .tx()
      .insert(scannerDevices)
      .values(values)
      .returning({ id: scannerDevices.id })
    return row!.id
  }

  /** Revokes the scanner of the edition; one revoked already stays as it was. */
  async revoke(editionId: string, id: string, at: Date) {
    if (!isUuid(id)) return
    await this.context
      .tx()
      .update(scannerDevices)
      .set({ revokedAt: at })
      .where(
        and(
          eq(scannerDevices.editionId, editionId),
          eq(scannerDevices.id, id),
          isNull(scannerDevices.revokedAt),
        ),
      )
  }

  /**
   * The scanner of the tenant when it stands at `now`: not revoked, not ended, and enabled by an
   * org who is still in the team with an access that has not ended. `paired` asks for one a phone
   * holds the token of, or for one still waiting for its phone, its row locked.
   */
  async standing(
    tenantId: string,
    id: string,
    now: Date,
    paired = true,
  ): Promise<(StandingScanner & { expiresAt: Date; pairingExpiresAt: Date }) | undefined> {
    const query = this.context
      .tx()
      .select({
        id: scannerDevices.id,
        tenantId: scannerDevices.tenantId,
        editionId: scannerDevices.editionId,
        name: scannerDevices.name,
        expiresAt: scannerDevices.expiresAt,
        pairingExpiresAt: scannerDevices.pairingExpiresAt,
      })
      .from(scannerDevices)
      .innerJoin(
        tenantMemberships,
        and(
          eq(tenantMemberships.id, scannerDevices.enabledByMembershipId),
          eq(tenantMemberships.tenantId, scannerDevices.tenantId),
        ),
      )
      .where(
        and(
          eq(scannerDevices.tenantId, tenantId),
          eq(scannerDevices.id, id),
          isNull(scannerDevices.revokedAt),
          gt(scannerDevices.expiresAt, now),
          paired ? sql`${scannerDevices.pairedAt} is not null` : isNull(scannerDevices.pairedAt),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, now)),
        ),
      )
    const [row] = await (paired ? query : query.for('update', { of: scannerDevices }))
    return row
  }

  /** A phone spent the pairing code: it holds the token from now on, and the code is used. */
  async pair(id: string, tokenHash: string, at: Date) {
    await this.context
      .tx()
      .update(scannerDevices)
      .set({ pairedAt: at, tokenHash })
      .where(eq(scannerDevices.id, id))
  }

  async touch(id: string, at: Date) {
    await this.context
      .tx()
      .update(scannerDevices)
      .set({ lastUsedAt: at })
      .where(eq(scannerDevices.id, id))
  }

  /** What a paired phone shows of itself: its edition and its convention, by name. */
  async names(tenantId: string, editionId: string) {
    const [row] = await this.context
      .tx()
      .select({ editionName: editions.name, conventionName: tenants.name })
      .from(editions)
      .innerJoin(tenants, eq(tenants.id, editions.tenantId))
      .where(and(eq(editions.tenantId, tenantId), eq(editions.id, editionId)))
    return row
  }
}
