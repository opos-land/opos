import { Injectable } from '@nestjs/common'
import { type PublicEdition, type PublicProgramItem } from '@opos/contract'
import { accounts, editions, programItemLikes, programItems, programItemSpeakers } from '@opos/db'
import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'

const editionColumns = {
  id: editions.id,
  slug: editions.slug,
  name: editions.name,
  startsAt: editions.startsAt,
  endsAt: editions.endsAt,
  isActive: editions.isActive,
}

const itemColumns = {
  id: programItems.id,
  title: programItems.title,
  description: programItems.description,
  startsAt: programItems.startsAt,
  endsAt: programItems.endsAt,
}

type ItemRow = Omit<PublicProgramItem, 'startsAt' | 'endsAt' | 'speakers' | 'likeCount'> & {
  startsAt: Date
  endsAt: Date
}

const toEdition = ({
  startsAt,
  endsAt,
  ...row
}: Omit<PublicEdition, 'startsAt' | 'endsAt'> & {
  startsAt: Date
  endsAt: Date
}): PublicEdition => ({
  ...row,
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
})

/**
 * What a convention's page shows, inside the tenant the address names; RLS keeps every query inside
 * it. Only a published edition exists here: the filter sits in this repository (PLAN.md 5.7), so an
 * unpublished one answers like an unknown one.
 */
@Injectable()
export class PublicRepository {
  constructor(private readonly context: TenantContextService) {}

  private publishedEditions(where?: SQL) {
    return this.context
      .tx()
      .select(editionColumns)
      .from(editions)
      .where(and(eq(editions.isPublished, true), where))
  }

  async editions(): Promise<PublicEdition[]> {
    const rows = await this.publishedEditions().orderBy(desc(editions.startsAt))
    return rows.map(toEdition)
  }

  async activeEdition(): Promise<PublicEdition> {
    const [row] = await this.publishedEditions(eq(editions.isActive, true))
    if (!row) throw notFound('edition')
    return toEdition(row)
  }

  async edition(slug: string): Promise<PublicEdition> {
    const [row] = await this.publishedEditions(eq(editions.slug, slug))
    if (!row) throw notFound('edition')
    return toEdition(row)
  }

  /** Names alone: an address or account id never leaves here, nor who liked an item. */
  private async withCounters(rows: ItemRow[]): Promise<PublicProgramItem[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const tx = this.context.tx()
    const speakers = await tx
      .select({
        programItemId: programItemSpeakers.programItemId,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
      })
      .from(programItemSpeakers)
      .innerJoin(accounts, eq(accounts.id, programItemSpeakers.accountId))
      .where(inArray(programItemSpeakers.programItemId, ids))
      .orderBy(asc(accounts.lastName), asc(accounts.firstName))
    const likes = await tx
      .select({ programItemId: programItemLikes.programItemId, likes: count() })
      .from(programItemLikes)
      .where(inArray(programItemLikes.programItemId, ids))
      .groupBy(programItemLikes.programItemId)
    const likeCounts = new Map(likes.map((row) => [row.programItemId, row.likes]))
    return rows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      speakers: speakers
        .filter((speaker) => speaker.programItemId === row.id)
        .filter((speaker) => speaker.firstName || speaker.lastName)
        .map(({ firstName, lastName }) => ({ firstName, lastName })),
      likeCount: likeCounts.get(row.id) ?? 0,
    }))
  }

  async programItems(editionId: string): Promise<PublicProgramItem[]> {
    const rows = await this.context
      .tx()
      .select(itemColumns)
      .from(programItems)
      .where(eq(programItems.editionId, editionId))
      .orderBy(asc(programItems.startsAt), asc(programItems.title))
    return this.withCounters(rows)
  }

  async programItem(editionId: string, id: string): Promise<PublicProgramItem> {
    if (!isUuid(id)) throw notFound('programme item')
    const rows = await this.context
      .tx()
      .select(itemColumns)
      .from(programItems)
      .where(and(eq(programItems.editionId, editionId), eq(programItems.id, id)))
    const [item] = await this.withCounters(rows)
    if (!item) throw notFound('programme item')
    return item
  }
}
