import { Injectable } from '@nestjs/common'
import { MAX_PROGRAM_ITEMS, type ProgramItem, type UpdateProgramItem } from '@opos/contract'
import { accounts, programItems, programItemSpeakers } from '@opos/db'
import { and, asc, count, eq, inArray, isNotNull, notInArray } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound } from '../../common/errors/api-error'
import { postgresConstraint } from '../../common/filters/http-exception.filter'
import { isUuid } from '../../common/uuid'

const columns = {
  id: programItems.id,
  editionId: programItems.editionId,
  title: programItems.title,
  description: programItems.description,
  startsAt: programItems.startsAt,
  endsAt: programItems.endsAt,
}

type Row = Omit<ProgramItem, 'startsAt' | 'endsAt' | 'speakers'> & { startsAt: Date; endsAt: Date }

const dates = <T extends { startsAt?: string; endsAt?: string }>({
  startsAt,
  endsAt,
  ...rest
}: T) => ({
  ...rest,
  ...(startsAt && { startsAt: new Date(startsAt) }),
  ...(endsAt && { endsAt: new Date(endsAt) }),
})

export const speakerAccountNotFound = (email: string) =>
  new ApiError(404, 'speaker.account-not-found', 'No confirmed account uses this address', {
    email,
  })

/**
 * The programme items of the tenant in context and their speakers; RLS keeps every query inside the
 * tenant, and every item is looked up within the edition of the path, whose permission the request
 * was checked against.
 */
@Injectable()
export class ProgramRepository {
  constructor(private readonly context: TenantContextService) {}

  private async withSpeakers(rows: Row[]): Promise<ProgramItem[]> {
    if (rows.length === 0) return []
    const speakers = await this.context
      .tx()
      .select({
        programItemId: programItemSpeakers.programItemId,
        id: accounts.id,
        email: accounts.email,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
      })
      .from(programItemSpeakers)
      .innerJoin(accounts, eq(accounts.id, programItemSpeakers.accountId))
      .where(
        inArray(
          programItemSpeakers.programItemId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(accounts.lastName), asc(accounts.email))
    const byItem = Map.groupBy(speakers, (speaker) => speaker.programItemId)
    return rows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      speakers: (byItem.get(row.id) ?? []).map(({ programItemId: _, ...speaker }) => speaker),
    }))
  }

  async list(editionId: string): Promise<ProgramItem[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(programItems)
      .where(eq(programItems.editionId, editionId))
      .orderBy(asc(programItems.startsAt), asc(programItems.title))
    return this.withSpeakers(rows)
  }

  /** The item, or 404; an item of another edition or another tenant is no item of this path. */
  async get(editionId: string, id: string): Promise<ProgramItem> {
    if (!isUuid(id)) throw notFound('programme item')
    const rows = await this.context
      .tx()
      .select(columns)
      .from(programItems)
      .where(and(eq(programItems.editionId, editionId), eq(programItems.id, id)))
    const [item] = await this.withSpeakers(rows)
    if (!item) throw notFound('programme item')
    return item
  }

  async create(
    editionId: string,
    values: { title: string; description?: string | null; startsAt: string; endsAt: string },
  ): Promise<ProgramItem> {
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const [held] = await this.context
      .tx()
      .select({ items: count() })
      .from(programItems)
      .where(eq(programItems.editionId, editionId))
    if (held!.items >= MAX_PROGRAM_ITEMS) {
      throw new ApiError(409, 'program.too-many-items', 'The edition holds the most items it can', {
        limit: MAX_PROGRAM_ITEMS,
      })
    }
    const rows = await this.context
      .tx()
      .insert(programItems)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        title: values.title,
        description: values.description ?? null,
        startsAt: new Date(values.startsAt),
        endsAt: new Date(values.endsAt),
      })
      .returning(columns)
    return (await this.withSpeakers(rows))[0]!
  }

  /** endsAt not after the start violates program_items_ends_after_start, which the filter answers with 400. */
  async update(editionId: string, id: string, changes: UpdateProgramItem): Promise<ProgramItem> {
    if (!isUuid(id)) throw notFound('programme item')
    if (Object.keys(changes).length === 0) return this.get(editionId, id)
    const rows = await this.context
      .tx()
      .update(programItems)
      .set(dates(changes))
      .where(and(eq(programItems.editionId, editionId), eq(programItems.id, id)))
      .returning(columns)
    const [item] = await this.withSpeakers(rows)
    if (!item) throw notFound('programme item')
    return item
  }

  async remove(editionId: string, id: string) {
    if (!isUuid(id)) throw notFound('programme item')
    const rows = await this.context
      .tx()
      .delete(programItems)
      .where(and(eq(programItems.editionId, editionId), eq(programItems.id, id)))
      .returning({ id: programItems.id })
    if (rows.length === 0) throw notFound('programme item')
  }

  /** The confirmed accounts on these addresses; an unconfirmed account counts as none. */
  async confirmedAccounts(emails: string[]) {
    if (emails.length === 0) return []
    return this.context
      .tx()
      .select({ id: accounts.id, email: accounts.email })
      .from(accounts)
      .where(and(inArray(accounts.email, emails), isNotNull(accounts.emailConfirmedAt)))
  }

  /** Which of these addresses already speak in the edition. */
  async speakingInEdition(editionId: string, emails: string[]) {
    if (emails.length === 0) return new Set<string>()
    const rows = await this.context
      .tx()
      .selectDistinct({ email: accounts.email })
      .from(programItemSpeakers)
      .innerJoin(programItems, eq(programItems.id, programItemSpeakers.programItemId))
      .innerJoin(accounts, eq(accounts.id, programItemSpeakers.accountId))
      .where(and(eq(programItems.editionId, editionId), inArray(accounts.email, emails)))
    return new Set(rows.map((row) => row.email))
  }

  /**
   * Makes these accounts the speakers of an item the caller has found in its edition. An account
   * deletion takes no tenant lock, so one committed after the lookup fails the foreign key here.
   */
  async replaceSpeakers(programItemId: string, speakers: { id: string; email: string }[]) {
    const tx = this.context.tx()
    await tx.delete(programItemSpeakers).where(
      and(
        eq(programItemSpeakers.programItemId, programItemId),
        speakers.length > 0
          ? notInArray(
              programItemSpeakers.accountId,
              speakers.map(({ id }) => id),
            )
          : undefined,
      ),
    )
    const tenantId = this.context.tenant().id
    for (const { id: accountId, email } of speakers) {
      try {
        await tx
          .insert(programItemSpeakers)
          .values({ tenantId, programItemId, accountId })
          .onConflictDoNothing()
      } catch (error) {
        if (postgresConstraint(error) === 'program_item_speakers_account_fk') {
          throw speakerAccountNotFound(email)
        }
        throw error
      }
    }
  }
}
