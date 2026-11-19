import { Injectable } from '@nestjs/common'
import { editionShops } from '@opos/db'
import { and, eq, isNotNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/** The shops of the editions of the tenant in context; RLS keeps every query inside it. */
@Injectable()
export class EditionShopsRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * Whether a shop of the convention is open: while one is, the seller's details stay complete
   * and the provider account stays connected (docs/specs/0002-shop-setup.md, S5 and P6).
   */
  async anyOpen(): Promise<boolean> {
    const [open] = await this.context
      .tx()
      .select({ editionId: editionShops.editionId })
      .from(editionShops)
      .where(
        and(eq(editionShops.tenantId, this.context.tenant().id), isNotNull(editionShops.openedAt)),
      )
      .limit(1)
    return open !== undefined
  }
}
