import { Injectable } from '@nestjs/common'
import { editionSlug, type PublicEdition, type PublicProgramItem } from '@opos/contract'
import {
  accountProfiles,
  accounts,
  editions,
  programItemLikes,
  programItems,
  programItemSpeakers,
} from '@opos/db'
import { and, asc, count, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm'
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
  venueName: editions.venueName,
  venueAddress: editions.venueAddress,
  venueCity: editions.venueCity,
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
 * it. Only a published edition exists here: the filter sits in this repository, so an
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
    if (!editionSlug.safeParse(slug).success) throw notFound('edition')
    const [row] = await this.publishedEditions(eq(editions.slug, slug))
    if (!row) throw notFound('edition')
    return toEdition(row)
  }

  /**
   * The public name of each speaker, and the identifier of its profile while that is published:
   * an address or account id never leaves here, nor who liked an item. A speaker with no part of
   * a name is listed too, for a page to name "Anon".
   */
  private async withCounters(rows: ItemRow[]): Promise<PublicProgramItem[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const tx = this.context.tx()
    const speakers = await tx
      .select({
        programItemId: programItemSpeakers.programItemId,
        firstName: accounts.firstName,
        nickname: accounts.nickname,
        lastName: accounts.lastName,
        nameOrder: accounts.nameOrder,
        profileId: accountProfiles.publicId,
      })
      .from(programItemSpeakers)
      .innerJoin(accounts, eq(accounts.id, programItemSpeakers.accountId))
      // A profile that is withdrawn or taken down, which the database never holds as published,
      // gives the programme nothing to lead to.
      .leftJoin(
        accountProfiles,
        and(
          eq(accountProfiles.accountId, programItemSpeakers.accountId),
          isNotNull(accountProfiles.publishedAt),
        ),
      )
      .where(inArray(programItemSpeakers.programItemId, ids))
      .orderBy(asc(accounts.lastName), asc(accounts.firstName), asc(accounts.nickname))
    const likes = await tx
      .select({ programItemId: programItemLikes.programItemId, likes: count() })
      .from(programItemLikes)
      .where(inArray(programItemLikes.programItemId, ids))
      .groupBy(programItemLikes.programItemId)
    const likeCounts = new Map(likes.map((row) => [row.programItemId, row.likes]))
    const byItem = Map.groupBy(speakers, (speaker) => speaker.programItemId)
    return rows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      speakers: (byItem.get(row.id) ?? []).map(({ programItemId: _item, ...speaker }) => speaker),
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
