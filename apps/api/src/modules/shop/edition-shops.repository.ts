import { Injectable } from '@nestjs/common'
import { editions, editionShops } from '@opos/db'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

export interface StoredEditionShop {
  openedAt: Date | null
  faqUrl: string | null
  teenFromAge: number | null
  adultFromAge: number | null
  guardianConsentFormUrl: string | null
  merchPreorderDeadline: Date | null
  merchOnlyEnabled: boolean
  salesClosedMessage: string | null
  pickupInformation: string | null
  openingHours: string | null
  reminderDaysBefore: number | null
  reminderSentAt: Date | null
}

/** What an org sets of a shop: everything but whether it is open and when its reminder went out. */
export type EditionShopSettings = Partial<Omit<StoredEditionShop, 'openedAt' | 'reminderSentAt'>>

const columns = {
  openedAt: editionShops.openedAt,
  faqUrl: editionShops.faqUrl,
  teenFromAge: editionShops.teenFromAge,
  adultFromAge: editionShops.adultFromAge,
  guardianConsentFormUrl: editionShops.guardianConsentFormUrl,
  merchPreorderDeadline: editionShops.merchPreorderDeadline,
  merchOnlyEnabled: editionShops.merchOnlyEnabled,
  salesClosedMessage: editionShops.salesClosedMessage,
  pickupInformation: editionShops.pickupInformation,
  openingHours: editionShops.openingHours,
  reminderDaysBefore: editionShops.reminderDaysBefore,
  reminderSentAt: editionShops.reminderSentAt,
}

/** A shop nothing was set for: closed, with no setting of its own. */
const UNSET: StoredEditionShop = {
  openedAt: null,
  faqUrl: null,
  teenFromAge: null,
  adultFromAge: null,
  guardianConsentFormUrl: null,
  merchPreorderDeadline: null,
  merchOnlyEnabled: false,
  salesClosedMessage: null,
  pickupInformation: null,
  openingHours: null,
  reminderDaysBefore: null,
  reminderSentAt: null,
}

/**
 * The shops of the editions of the tenant in context, one row an edition; RLS keeps every query
 * inside it. The edition is the one the route's path names, whose permission the request was
 * checked against.
 */
@Injectable()
export class EditionShopsRepository {
  constructor(private readonly context: TenantContextService) {}

  private tenantId() {
    return this.context.tenant().id
  }

  private own(editionId: string) {
    return and(eq(editionShops.tenantId, this.tenantId()), eq(editionShops.editionId, editionId))
  }

  /**
   * Whether a shop of the convention is open: while one is, the seller's details stay complete
   * and the provider account stays connected (docs/specs/0002-shop-setup.md, S5 and P6).
   */
  async anyOpen(): Promise<boolean> {
    const [open] = await this.context
      .tx()
      .select({ editionId: editionShops.editionId })
      .from(editionShops)
      .where(and(eq(editionShops.tenantId, this.tenantId()), isNotNull(editionShops.openedAt)))
      .limit(1)
    return open !== undefined
  }

  /** The shop of the edition; an edition nothing was set for has a closed one. */
  async find(editionId: string): Promise<StoredEditionShop> {
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(editionShops)
      .where(this.own(editionId))
    return row ?? UNSET
  }

  /** When the edition of the tenant starts: what the day of its reminder is counted from. */
  async startsAt(editionId: string): Promise<Date | undefined> {
    const [row] = await this.context
      .tx()
      .select({ startsAt: editions.startsAt })
      .from(editions)
      .where(and(eq(editions.tenantId, this.tenantId()), eq(editions.id, editionId)))
    return row?.startsAt
  }

  /** Sets what the change names and leaves the rest; the first setting makes the edition's row. */
  async set(editionId: string, settings: EditionShopSettings) {
    if (Object.keys(settings).length === 0) return
    await this.context
      .tx()
      .insert(editionShops)
      .values({ tenantId: this.tenantId(), editionId, ...settings })
      .onConflictDoUpdate({ target: editionShops.editionId, set: settings })
  }

  /** Opens the shop; one already open keeps the moment it was opened. */
  async open(editionId: string) {
    const openedAt = new Date()
    await this.context
      .tx()
      .insert(editionShops)
      .values({ tenantId: this.tenantId(), editionId, openedAt })
      .onConflictDoUpdate({
        target: editionShops.editionId,
        set: { openedAt },
        setWhere: isNull(editionShops.openedAt),
      })
  }

  /** Closes the shop; a closed one, and one nothing was set for, stays as it is. */
  async close(editionId: string) {
    await this.context
      .tx()
      .update(editionShops)
      .set({ openedAt: null })
      .where(and(this.own(editionId), isNotNull(editionShops.openedAt)))
  }
}
