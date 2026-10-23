import { Injectable } from '@nestjs/common'
import { type Edition } from '@opos/contract'
import { editions } from '@opos/db'
import { and, desc, eq, ne } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { isUuid } from '../../common/uuid'

const columns = {
  id: editions.id,
  slug: editions.slug,
  name: editions.name,
  startsAt: editions.startsAt,
  endsAt: editions.endsAt,
  isActive: editions.isActive,
  isPublished: editions.isPublished,
}

type Row = Omit<Edition, 'startsAt' | 'endsAt'> & { startsAt: Date; endsAt: Date }

const toEdition = (row: Row): Edition => ({
  ...row,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
})

const dates = <T extends { startsAt?: string; endsAt?: string }>({
  startsAt,
  endsAt,
  ...rest
}: T) => ({
  ...rest,
  ...(startsAt && { startsAt: new Date(startsAt) }),
  ...(endsAt && { endsAt: new Date(endsAt) }),
})

/** The editions of the tenant in context; RLS keeps every query inside it. */
@Injectable()
export class EditionsRepository {
  constructor(private readonly context: TenantContextService) {}

  async list(): Promise<Edition[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(editions)
      .orderBy(desc(editions.startsAt))
    return rows.map(toEdition)
  }

  async find(id: string): Promise<Edition | undefined> {
    if (!isUuid(id)) return undefined
    const [row] = await this.context.tx().select(columns).from(editions).where(eq(editions.id, id))
    return row && toEdition(row)
  }

  /** A taken slug violates editions_tenant_slug_unique, which the filter answers with 409. */
  async create(values: { slug: string; name: string; startsAt: string; endsAt: string }) {
    const [row] = await this.context
      .tx()
      .insert(editions)
      .values({
        ...dates(values),
        tenantId: this.context.tenant().id,
      } as typeof editions.$inferInsert)
      .returning(columns)
    return toEdition(row!)
  }

  async update(
    id: string,
    changes: {
      slug?: string
      name?: string
      startsAt?: string
      endsAt?: string
      isPublished?: boolean
    },
  ) {
    if (Object.keys(changes).length > 0) {
      await this.context.tx().update(editions).set(dates(changes)).where(eq(editions.id, id))
    }
    return (await this.find(id))!
  }

  async remove(id: string) {
    await this.context.tx().delete(editions).where(eq(editions.id, id))
  }

  /** The transactional switch of PLAN.md 4.5: the previous active edition first, then this one. */
  async activate(id: string) {
    const tx = this.context.tx()
    await tx
      .update(editions)
      .set({ isActive: false })
      .where(and(eq(editions.isActive, true), ne(editions.id, id)))
    await tx.update(editions).set({ isActive: true }).where(eq(editions.id, id))
    return (await this.find(id))!
  }
}
