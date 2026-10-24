import { Injectable } from '@nestjs/common'
import { type Edition } from '@opos/contract'
import { editions, tenants } from '@opos/db'
import { and, desc, eq, ne } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, notFound } from '../../common/errors/api-error'
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

  /** The edition, or 404; another tenant's edition is invisible under RLS. */
  async get(id: string): Promise<Edition> {
    const edition = await this.find(id)
    if (!edition) throw notFound('edition')
    return edition
  }

  /** A taken slug violates editions_tenant_slug_unique, which the filter answers with 409. */
  async create(values: { slug: string; name: string; startsAt: string; endsAt: string }) {
    const [row] = await this.context
      .tx()
      .insert(editions)
      .values({
        slug: values.slug,
        name: values.name,
        startsAt: new Date(values.startsAt),
        endsAt: new Date(values.endsAt),
        tenantId: this.context.tenant().id,
      })
      .returning(columns)
    return toEdition(row!)
  }

  /** endsAt not after startsAt violates editions_ends_after_start, which the filter answers with 400. */
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
    if (Object.keys(changes).length === 0) return this.get(id)
    const [row] = await this.context
      .tx()
      .update(editions)
      .set(dates(changes))
      .where(eq(editions.id, id))
      .returning(columns)
    // Deleted by a concurrent request after get(): the edition no longer exists.
    if (!row) throw notFound('edition')
    return toEdition(row)
  }

  /**
   * Deletes the edition unless it is active, in one statement: an activation committed meanwhile
   * makes the row fail the condition, so the tenant never loses its active edition. A delete
   * committed meanwhile leaves no row either, and the edition is then gone rather than active.
   */
  async removeInactive(id: string) {
    const rows = await this.context
      .tx()
      .delete(editions)
      .where(and(eq(editions.id, id), eq(editions.isActive, false)))
      .returning({ id: editions.id })
    if (rows.length > 0) return
    if (!(await this.find(id))) throw notFound('edition')
    throw new ApiError(409, 'edition.active', 'The active edition cannot be deleted')
  }

  /**
   * The transactional switch of PLAN.md 4.5. The tenant row lock serialises two activations in
   * one tenant, so the second sees the first and editions_one_active_unique is never hit.
   */
  async activate(id: string) {
    const tx = this.context.tx()
    await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, this.context.tenant().id))
      .for('no key update')
    await tx
      .update(editions)
      .set({ isActive: false })
      .where(and(eq(editions.isActive, true), ne(editions.id, id)))
    const [row] = await tx
      .update(editions)
      .set({ isActive: true })
      .where(eq(editions.id, id))
      .returning(columns)
    if (!row) throw notFound('edition')
    return toEdition(row)
  }
}
