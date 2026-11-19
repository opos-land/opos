import { Injectable } from '@nestjs/common'
import { editionShops } from '@opos/db'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

export interface StoredEditionShop {
  openedAt: Date | null
  faqUrl: string | null
}

const columns = { openedAt: editionShops.openedAt, faqUrl: editionShops.faqUrl }

/** A shop nothing was set for: closed, with no FAQ address. */
const UNSET: StoredEditionShop = { openedAt: null, faqUrl: null }

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

  async setFaqUrl(editionId: string, faqUrl: string | null) {
    await this.context
      .tx()
      .insert(editionShops)
      .values({ tenantId: this.tenantId(), editionId, faqUrl })
      .onConflictDoUpdate({ target: editionShops.editionId, set: { faqUrl } })
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
