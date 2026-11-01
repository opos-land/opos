import { Injectable } from '@nestjs/common'
import { editions, programItemLikes, programItems } from '@opos/db'
import { and, eq, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

/** The account's likes in the tenant of the transaction; RLS keeps every query inside it. */
@Injectable()
export class EngagementRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The item, through its own edition; `undefined` when it is not there. */
  private async item(editionId: string, id: string) {
    if (!isUuid(editionId) || !isUuid(id)) return undefined
    const [row] = await this.context
      .tx()
      .select({
        id: programItems.id,
        isPublished: editions.isPublished,
        ended: sql<boolean>`${editions.endsAt} <= statement_timestamp()`,
      })
      .from(programItems)
      .innerJoin(editions, eq(editions.id, programItems.editionId))
      .where(and(eq(programItems.id, id), eq(editions.id, editionId)))
    return row
  }

  /**
   * An item deleted meanwhile violates program_item_likes_program_item_fk, which the filter answers
   * with 404. An unpublished edition answers like an unknown one.
   */
  async like(editionId: string, id: string) {
    const item = await this.item(editionId, id)
    if (!item?.isPublished) throw notFound('programme item')
    if (item.ended) {
      throw new ApiError(409, 'like.edition-ended', 'The edition of this item has ended')
    }
    await this.context
      .tx()
      .insert(programItemLikes)
      .values({
        tenantId: this.context.tenant().id,
        programItemId: item.id,
        accountId: this.context.account().id,
      })
      .onConflictDoNothing()
  }

  /**
   * A like is the account's own, so it can always be taken back. Without one, an unpublished edition
   * answers like an unknown one here too, so this tells nobody that a draft item exists.
   */
  async unlike(editionId: string, id: string) {
    const item = await this.item(editionId, id)
    if (!item) throw notFound('programme item')
    const removed = await this.context
      .tx()
      .delete(programItemLikes)
      .where(
        and(
          eq(programItemLikes.programItemId, item.id),
          eq(programItemLikes.accountId, this.context.account().id),
        ),
      )
      .returning({ id: programItemLikes.id })
    if (removed.length === 0 && !item.isPublished) throw notFound('programme item')
  }
}
