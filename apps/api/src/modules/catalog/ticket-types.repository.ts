import { Injectable } from '@nestjs/common'
import {
  AGE_BANDS,
  type AgeBand,
  type CreateTicketType,
  MAX_TICKET_TYPES,
  type TicketType,
  type UpdateTicketType,
} from '@opos/contract'
import {
  addOns,
  merchandiseItems,
  ticketTypeAddOns,
  ticketTypeMerchandiseItems,
  ticketTypePerks,
  ticketTypePriceTiers,
  ticketTypes,
  ticketTypeSupporterPrices,
} from '@opos/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { moved } from '../../common/order'
import { isUuid } from '../../common/uuid'
import { limitReached } from './catalog.errors'
import { arrange, hiddenAt, orderOf } from './places'

const columns = {
  id: ticketTypes.id,
  editionId: ticketTypes.editionId,
  name: ticketTypes.name,
  shortDescription: ticketTypes.shortDescription,
  longDescription: ticketTypes.longDescription,
  capacity: ticketTypes.capacity,
  saleStartsAt: ticketTypes.saleStartsAt,
  saleEndsAt: ticketTypes.saleEndsAt,
  allowsChild: ticketTypes.allowsChild,
  allowsTeen: ticketTypes.allowsTeen,
  allowsAdult: ticketTypes.allowsAdult,
  discountsExcluded: ticketTypes.discountsExcluded,
  shownOutsideSaleWindow: ticketTypes.shownOutsideSaleWindow,
  position: ticketTypes.position,
  hiddenAt: ticketTypes.hiddenAt,
}

/** A ticket type as its row holds it: its age bands a column each, its moments as dates. */
interface Row {
  id: string
  editionId: string
  name: string
  shortDescription: string
  longDescription: string
  capacity: number | null
  saleStartsAt: Date
  saleEndsAt: Date
  allowsChild: boolean
  allowsTeen: boolean
  allowsAdult: boolean
  discountsExcluded: boolean
  shownOutsideSaleWindow: boolean
  position: number
  hiddenAt: Date | null
}

/** The lists that travel with a ticket type, each replaced as a whole. */
type Lists = Pick<
  UpdateTicketType,
  'tiers' | 'supporterPrices' | 'perks' | 'addOnIds' | 'merchandiseItemIds'
>

/** The age bands as the row holds them: a column each. */
const allowed = (ageBands: readonly AgeBand[]) => ({
  allowsChild: ageBands.includes('child'),
  allowsTeen: ageBands.includes('teen'),
  allowsAdult: ageBands.includes('adult'),
})

/**
 * The ticket types of the editions of the tenant in context, in their order, each with the lists
 * that travel with it; RLS keeps every query inside the tenant, and every ticket type is looked
 * up within the edition of the path, whose permission the request was checked against.
 */
@Injectable()
export class TicketTypesRepository {
  constructor(private readonly context: TenantContextService) {}

  private inEdition(editionId: string, id: string) {
    return and(eq(ticketTypes.editionId, editionId), eq(ticketTypes.id, id))
  }

  private async assembled(rows: Row[]): Promise<TicketType[]> {
    if (rows.length === 0) return []
    const tx = this.context.tx()
    const ids = rows.map((row) => row.id)
    const tiers = await tx
      .select({
        ticketTypeId: ticketTypePriceTiers.ticketTypeId,
        amountMinor: ticketTypePriceTiers.amountMinor,
        startsAt: ticketTypePriceTiers.startsAt,
        endsAt: ticketTypePriceTiers.endsAt,
      })
      .from(ticketTypePriceTiers)
      .where(inArray(ticketTypePriceTiers.ticketTypeId, ids))
      .orderBy(asc(ticketTypePriceTiers.startsAt))
    const supporterPrices = await tx
      .select({
        ticketTypeId: ticketTypeSupporterPrices.ticketTypeId,
        amountMinor: ticketTypeSupporterPrices.amountMinor,
      })
      .from(ticketTypeSupporterPrices)
      .where(inArray(ticketTypeSupporterPrices.ticketTypeId, ids))
      .orderBy(asc(ticketTypeSupporterPrices.amountMinor))
    const perks = await tx
      .select({ ticketTypeId: ticketTypePerks.ticketTypeId, name: ticketTypePerks.name })
      .from(ticketTypePerks)
      .where(inArray(ticketTypePerks.ticketTypeId, ids))
      .orderBy(asc(ticketTypePerks.position), asc(ticketTypePerks.id))
    const offeredAddOns = await tx
      .select({ ticketTypeId: ticketTypeAddOns.ticketTypeId, id: ticketTypeAddOns.addOnId })
      .from(ticketTypeAddOns)
      .innerJoin(addOns, eq(addOns.id, ticketTypeAddOns.addOnId))
      .where(inArray(ticketTypeAddOns.ticketTypeId, ids))
      .orderBy(asc(addOns.position), asc(addOns.id))
    const offeredItems = await tx
      .select({
        ticketTypeId: ticketTypeMerchandiseItems.ticketTypeId,
        id: ticketTypeMerchandiseItems.merchandiseItemId,
      })
      .from(ticketTypeMerchandiseItems)
      .innerJoin(
        merchandiseItems,
        eq(merchandiseItems.id, ticketTypeMerchandiseItems.merchandiseItemId),
      )
      .where(inArray(ticketTypeMerchandiseItems.ticketTypeId, ids))
      .orderBy(asc(merchandiseItems.position), asc(merchandiseItems.id))

    const of = <Row extends { ticketTypeId: string }>(list: Row[]) =>
      Map.groupBy(list, (row) => row.ticketTypeId)
    const [tiersOf, pricesOf, perksOf, addOnsOf, itemsOf] = [
      of(tiers),
      of(supporterPrices),
      of(perks),
      of(offeredAddOns),
      of(offeredItems),
    ] as const

    return rows.map(({ allowsChild, allowsTeen, allowsAdult, hiddenAt: hidden, ...row }) => {
      const allows = { child: allowsChild, teen: allowsTeen, adult: allowsAdult }
      return {
        ...row,
        saleStartsAt: row.saleStartsAt.toISOString(),
        saleEndsAt: row.saleEndsAt.toISOString(),
        ageBands: AGE_BANDS.filter((band) => allows[band]),
        hidden: hidden !== null,
        tiers: (tiersOf.get(row.id) ?? []).map((tier) => ({
          amountMinor: tier.amountMinor,
          startsAt: tier.startsAt.toISOString(),
          endsAt: tier.endsAt.toISOString(),
        })),
        supporterPrices: (pricesOf.get(row.id) ?? []).map((price) => price.amountMinor),
        perks: (perksOf.get(row.id) ?? []).map((perk) => perk.name),
        addOnIds: (addOnsOf.get(row.id) ?? []).map((offered) => offered.id),
        merchandiseItemIds: (itemsOf.get(row.id) ?? []).map((offered) => offered.id),
      }
    })
  }

  async list(editionId: string): Promise<TicketType[]> {
    const rows = await this.context
      .tx()
      .select(columns)
      .from(ticketTypes)
      .where(eq(ticketTypes.editionId, editionId))
      .orderBy(asc(ticketTypes.position), asc(ticketTypes.id))
    return this.assembled(rows)
  }

  /** The ticket type, or 404; one of another edition or another tenant is none of this path. */
  async get(editionId: string, id: string): Promise<TicketType> {
    if (!isUuid(id)) throw notFound('ticket type')
    const rows = await this.context
      .tx()
      .select(columns)
      .from(ticketTypes)
      .where(this.inEdition(editionId, id))
    const [ticketType] = await this.assembled(rows)
    if (!ticketType) throw notFound('ticket type')
    return ticketType
  }

  /**
   * Refuses an add-on or a merchandise item that is not of the edition: a ticket type offers what
   * its own edition sells, and the row of another edition or another tenant is unknown here.
   */
  async checkOffers(editionId: string, offers: Pick<Lists, 'addOnIds' | 'merchandiseItemIds'>) {
    const tx = this.context.tx()
    const { addOnIds = [], merchandiseItemIds = [] } = offers
    if (addOnIds.length > 0) {
      const held = await tx
        .select({ id: addOns.id })
        .from(addOns)
        .where(and(eq(addOns.editionId, editionId), inArray(addOns.id, addOnIds)))
      if (held.length !== addOnIds.length) throw notFound('add-on')
    }
    if (merchandiseItemIds.length > 0) {
      const held = await tx
        .select({ id: merchandiseItems.id })
        .from(merchandiseItems)
        .where(
          and(
            eq(merchandiseItems.editionId, editionId),
            inArray(merchandiseItems.id, merchandiseItemIds),
          ),
        )
      if (held.length !== merchandiseItemIds.length) throw notFound('merchandise item')
    }
  }

  /** Replaces each list the change names with the new one; a list it leaves out stays. */
  private async setLists(editionId: string, id: string, lists: Lists) {
    const tx = this.context.tx()
    const of = { tenantId: this.context.tenant().id, editionId, ticketTypeId: id }
    if (lists.tiers) {
      await tx.delete(ticketTypePriceTiers).where(eq(ticketTypePriceTiers.ticketTypeId, id))
      if (lists.tiers.length > 0) {
        await tx.insert(ticketTypePriceTiers).values(
          lists.tiers.map((tier) => ({
            ...of,
            amountMinor: tier.amountMinor,
            startsAt: new Date(tier.startsAt),
            endsAt: new Date(tier.endsAt),
          })),
        )
      }
    }
    if (lists.supporterPrices) {
      await tx
        .delete(ticketTypeSupporterPrices)
        .where(eq(ticketTypeSupporterPrices.ticketTypeId, id))
      if (lists.supporterPrices.length > 0) {
        await tx
          .insert(ticketTypeSupporterPrices)
          .values(lists.supporterPrices.map((amountMinor) => ({ ...of, amountMinor })))
      }
    }
    if (lists.perks) {
      await tx.delete(ticketTypePerks).where(eq(ticketTypePerks.ticketTypeId, id))
      if (lists.perks.length > 0) {
        await tx
          .insert(ticketTypePerks)
          .values(lists.perks.map((name, index) => ({ ...of, name, position: index + 1 })))
      }
    }
    if (lists.addOnIds) {
      await tx.delete(ticketTypeAddOns).where(eq(ticketTypeAddOns.ticketTypeId, id))
      if (lists.addOnIds.length > 0) {
        await tx
          .insert(ticketTypeAddOns)
          .values(lists.addOnIds.map((addOnId) => ({ ...of, addOnId })))
      }
    }
    if (lists.merchandiseItemIds) {
      await tx
        .delete(ticketTypeMerchandiseItems)
        .where(eq(ticketTypeMerchandiseItems.ticketTypeId, id))
      if (lists.merchandiseItemIds.length > 0) {
        await tx
          .insert(ticketTypeMerchandiseItems)
          .values(
            lists.merchandiseItemIds.map((merchandiseItemId) => ({ ...of, merchandiseItemId })),
          )
      }
    }
  }

  /** A new ticket type takes the last place of the list. */
  async create(editionId: string, values: CreateTicketType): Promise<TicketType> {
    const tx = this.context.tx()
    // A write runs under the tenant's write lock, so nothing is added after the count.
    const held = await orderOf(tx, ticketTypes, editionId)
    if (held.length >= MAX_TICKET_TYPES) throw limitReached(MAX_TICKET_TYPES)
    const { ageBands, saleStartsAt, saleEndsAt, tiers, supporterPrices, perks, ...fields } = values
    const { addOnIds, merchandiseItemIds, ...row } = fields
    const [made] = await tx
      .insert(ticketTypes)
      .values({
        tenantId: this.context.tenant().id,
        editionId,
        ...row,
        ...allowed(ageBands),
        saleStartsAt: new Date(saleStartsAt),
        saleEndsAt: new Date(saleEndsAt),
        position: held.length + 1,
      })
      .returning({ id: ticketTypes.id })
    await this.setLists(editionId, made!.id, {
      tiers,
      supporterPrices,
      perks,
      addOnIds,
      merchandiseItemIds,
    })
    return this.get(editionId, made!.id)
  }

  /** A ticket type hidden again keeps the moment it was first hidden at. */
  async update(editionId: string, id: string, changes: UpdateTicketType): Promise<TicketType> {
    const { tiers, supporterPrices, perks, addOnIds, merchandiseItemIds, ...rest } = changes
    const { position, hidden, ageBands, saleStartsAt, saleEndsAt, ...fields } = rest
    const tx = this.context.tx()
    const set = {
      ...fields,
      ...(ageBands && allowed(ageBands)),
      ...(saleStartsAt !== undefined && { saleStartsAt: new Date(saleStartsAt) }),
      ...(saleEndsAt !== undefined && { saleEndsAt: new Date(saleEndsAt) }),
      ...(hidden !== undefined && { hiddenAt: hiddenAt(ticketTypes.hiddenAt, hidden) }),
    }
    if (Object.keys(set).length > 0) {
      await tx.update(ticketTypes).set(set).where(this.inEdition(editionId, id))
    }
    await this.setLists(editionId, id, {
      tiers,
      supporterPrices,
      perks,
      addOnIds,
      merchandiseItemIds,
    })
    if (position !== undefined) {
      const order = await orderOf(tx, ticketTypes, editionId)
      await arrange(tx, ticketTypes, editionId, moved(order, id, position))
    }
    return this.get(editionId, id)
  }

  /** Deletes the ticket type, its lists with it, and the rest close ranks. */
  async remove(editionId: string, id: string) {
    const tx = this.context.tx()
    await tx.delete(ticketTypes).where(this.inEdition(editionId, id))
    await arrange(tx, ticketTypes, editionId, await orderOf(tx, ticketTypes, editionId))
  }
}
