import { Injectable } from '@nestjs/common'
import { MAX_LISTED_HAND_OUTS, type Scanner, type ScannerDetail } from '@opos/contract'
import {
  accounts,
  editions,
  orderLines,
  orders,
  scannerDevices,
  tenantMemberships,
  tenants,
} from '@opos/db'
import { and, asc, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
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

  /**
   * What the scanner of the edition handed out: the lines that name it. A line an org marked in
   * the panel names no scanner, and a mark taken back names none either.
   */
  async handOuts(editionId: string, id: string): Promise<ScannerDetail['handOuts']> {
    const marked = and(eq(orderLines.editionId, editionId), eq(orderLines.handedOutBy, id))
    const lastAt = sql<Date>`max(${orderLines.handedOutAt})`
    const [total] = await this.context
      .tx()
      .select({
        orders: sql<number>`count(distinct ${orderLines.orderId})::int`,
        lines: sql<number>`count(*)::int`,
        firstAt: sql<Date | null>`min(${orderLines.handedOutAt})`,
        lastAt: sql<Date | null>`max(${orderLines.handedOutAt})`,
      })
      .from(orderLines)
      .where(marked)
    const latest = await this.context
      .tx()
      .select({
        orderId: orders.id,
        number: orders.number,
        holderName: orders.holderName,
        lines: sql<number>`count(*)::int`,
        lastAt,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(marked)
      .groupBy(orders.id, orders.number, orders.holderName)
      .orderBy(desc(lastAt), asc(orders.number))
      .limit(MAX_LISTED_HAND_OUTS)
    return {
      orders: total?.orders ?? 0,
      lines: total?.lines ?? 0,
      firstAt: total?.firstAt ? new Date(total.firstAt).toISOString() : null,
      lastAt: total?.lastAt ? new Date(total.lastAt).toISOString() : null,
      latest: latest.map((order) => ({ ...order, lastAt: new Date(order.lastAt).toISOString() })),
    }
  }

  /**
   * Gives the scanner of the edition a new pairing code, when it stands at `now`: not revoked and
   * not ended. In one statement the phone that held it loses its token and the scanner waits for
   * the phone that opens the new code. Answers whether it did.
   */
  async renewPairing(
    editionId: string,
    id: string,
    pairing: { codeHash: string; expiresAt: Date },
    now: Date,
  ): Promise<boolean> {
    const renewed = await this.context
      .tx()
      .update(scannerDevices)
      .set({
        pairingCodeHash: pairing.codeHash,
        pairingExpiresAt: pairing.expiresAt,
        pairedAt: null,
        tokenHash: null,
      })
      .where(
        and(
          eq(scannerDevices.editionId, editionId),
          eq(scannerDevices.id, id),
          isNull(scannerDevices.revokedAt),
          gt(scannerDevices.expiresAt, now),
        ),
      )
      .returning({ id: scannerDevices.id })
    return renewed.length > 0
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
  async pair(tenantId: string, id: string, tokenHash: string, at: Date) {
    await this.context
      .tx()
      .update(scannerDevices)
      .set({ pairedAt: at, tokenHash })
      .where(and(eq(scannerDevices.tenantId, tenantId), eq(scannerDevices.id, id)))
  }

  /** Notes that the scanner of the tenant was used; one revoked meanwhile is left as it is. */
  async touch(tenantId: string, id: string, at: Date) {
    await this.context
      .tx()
      .update(scannerDevices)
      .set({ lastUsedAt: at })
      .where(
        and(
          eq(scannerDevices.tenantId, tenantId),
          eq(scannerDevices.id, id),
          isNull(scannerDevices.revokedAt),
        ),
      )
  }

  /**
   * What a paired phone shows of itself: its edition and its convention, by name, and the time
   * zone it shows a moment in.
   */
  async names(tenantId: string, editionId: string) {
    const [row] = await this.context
      .tx()
      .select({
        editionName: editions.name,
        conventionName: tenants.name,
        timezone: tenants.timezone,
      })
      .from(editions)
      .innerJoin(tenants, eq(tenants.id, editions.tenantId))
      .where(and(eq(editions.tenantId, tenantId), eq(editions.id, editionId)))
    return row
  }
}
