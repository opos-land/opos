import { type I18n, type MessageDescriptor, setupI18n } from '@lingui/core'
import { Injectable } from '@nestjs/common'
import { type OrderStatus, type Sales } from '@opos/contract'
import {
  activateLocale,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  parseAcceptLanguage,
  toZonedWallTime,
} from '@opos/i18n'
import {
  exportNames,
  paymentColumns,
  pickListColumns,
  ticketHolderColumns,
} from '@opos/i18n/exports'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { amountCell, type CsvCell, csvFile } from '../../common/csv'
import { notFound } from '../../common/errors/api-error'
import { AddOnsRepository } from '../catalog/add-ons.repository'
import { MerchandiseRepository } from '../catalog/merchandise.repository'
import { TicketTypesRepository } from '../catalog/ticket-types.repository'
import { HELD, SalesRepository, SOLD } from './sales.repository'

/** The orders the ticket holder list holds: an order nobody paid for holds no ticket. */
const LISTED: readonly OrderStatus[] = [...HELD, 'canceled']

/** The information of an attempt that has a column of its own in the payments list. */
const KNOWN = ['transaction', 'batch', 'commissionMinor']

type Held = (typeof HELD)[number]
const isSold = (status: Held) => (SOLD as readonly string[]).includes(status)
const isPaid = (status: OrderStatus) => (SOLD as readonly OrderStatus[]).includes(status)

/**
 * The reports of an edition's sales (docs/specs/0010-sales-reports.md): the dashboard, counted
 * from the orders as they are, and three lists written as files. A file is named after the
 * edition and the list, is kept nowhere and reaches no log.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly sales: SalesRepository,
    private readonly ticketTypes: TicketTypesRepository,
    private readonly addOns: AddOnsRepository,
    private readonly items: MerchandiseRepository,
    private readonly context: TenantContextService,
  ) {}

  /** The dashboard (D1-D6): sold apart from pending, and nothing of an order that holds nothing. */
  async of(editionId: string): Promise<Sales> {
    const totals = await this.sales.totals(editionId)
    const held = await this.sales.held(editionId)
    const total = (status: Held) => totals.find((row) => row.status === status)
    /** What the orders hold of one row of the catalog, sold and pending. */
    const count = (of: (row: (typeof held)[number]) => boolean) => ({
      sold: held
        .filter((row) => of(row) && isSold(row.status))
        .reduce((sum, row) => sum + row.quantity, 0),
      pending: held
        .filter((row) => of(row) && !isSold(row.status))
        .reduce((sum, row) => sum + row.quantity, 0),
    })
    const bands = await this.sales.ageBands(editionId)
    const band = (name: 'child' | 'teen' | 'adult') =>
      bands.find((row) => row.ageBand === name)?.holders ?? 0
    const answers = await this.sales.answers(editionId)
    // A row is a day and a status: the two statuses of a day make one day of the dashboard.
    const days = new Map<string, Sales['days'][number]>()
    for (const row of await this.sales.days(editionId, this.context.tenant().timezone)) {
      const day = days.get(row.day) ?? { day: row.day, paidMinor: 0, manualMinor: 0, tickets: 0 }
      if (row.status === 'paid') day.paidMinor += row.totalMinor
      else day.manualMinor += row.totalMinor
      day.tickets += row.tickets
      days.set(row.day, day)
    }

    return {
      currency: 'PLN',
      revenue: {
        paidMinor: total('paid')?.totalMinor ?? 0,
        manualMinor: total('paid-manual')?.totalMinor ?? 0,
      },
      orders: {
        paid: total('paid')?.orders ?? 0,
        manual: total('paid-manual')?.orders ?? 0,
        awaitingPayment: total('awaiting-payment')?.orders ?? 0,
        needsReview: total('needs-review')?.orders ?? 0,
      },
      // Every row of the catalog, hidden ones too: an order may hold what the shop stopped showing.
      ticketTypes: (await this.ticketTypes.list(editionId)).map((type) => ({
        id: type.id,
        name: type.name,
        ...count((row) => row.ticketTypeId === type.id),
      })),
      addOns: (await this.addOns.list(editionId)).map((addOn) => ({
        id: addOn.id,
        name: addOn.name,
        kind: addOn.kind,
        ...count((row) => row.addOnId === addOn.id),
      })),
      items: (await this.items.list(editionId)).map((item) => ({
        id: item.id,
        name: item.name,
        variants: item.variants.map((variant) => ({
          id: variant.id,
          labels: item.axes.flatMap(
            (axis) => axis.values.find((value) => variant.valueIds.includes(value.id))?.label ?? [],
          ),
          ...count((row) => row.variantId === variant.id),
        })),
      })),
      days: [...days.values()],
      ageBands: { child: band('child'), teen: band('teen'), adult: band('adult') },
      customFields: (await this.sales.fields(editionId))
        .map((field) => ({
          id: field.id,
          label: field.label,
          answers: answers
            .filter((row) => row.fieldId === field.id)
            .map(({ answer, orders }) => ({ answer, orders }))
            .sort((a, b) => b.orders - a.orders || a.answer.localeCompare(b.answer)),
        }))
        // A field nobody answered has nothing to show.
        .filter((field) => field.answers.length > 0),
    }
  }

  /**
   * The language a file is written in, and how it writes a moment: its columns in the language
   * the request asks for, which the panel sends as the one it shows, then the account's own,
   * then the convention's; a moment in the convention's time zone (E6).
   */
  private async written(language: string | undefined) {
    const i18n = setupI18n()
    const tenant = this.context.tenant()
    const locale: Locale =
      parseAcceptLanguage(language)[0] ??
      this.context.account().locale ??
      (isLocale(tenant.defaultLocale) ? tenant.defaultLocale : DEFAULT_LOCALE)
    await activateLocale(i18n, locale)
    return {
      i18n,
      locale,
      moment: (at: Date | null) =>
        at ? toZonedWallTime(at, tenant.timezone).replace('T', ' ') : '',
    }
  }

  private async file(editionId: string, list: string, rows: readonly (readonly CsvCell[])[]) {
    const slug = await this.sales.editionSlug(editionId)
    if (!slug) throw notFound('edition')
    return {
      headers: {
        'content-disposition': `attachment; filename="${list}-${slug}.csv"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
      body: new Blob([csvFile(rows)], { type: 'text/csv; charset=utf-8' }),
    }
  }

  private header(i18n: I18n, columns: Record<string, MessageDescriptor>) {
    return Object.values(columns).map((column) => i18n._(column))
  }

  /**
   * The ticket holder list (E2): a row a ticket, which is an order with a ticket. Its add-ons are
   * its order's and those of every paid order on its QR code, as a "Buy more" order holds no
   * ticket of its own.
   */
  async ticketHolders(editionId: string, language: string | undefined) {
    const { i18n, moment } = await this.written(language)
    const fields = await this.sales.fields(editionId)
    const addOns = await this.sales.addOnLines(editionId)
    const answers = await this.sales.orderAnswers(editionId)
    const carried = await this.sales.qrCodeOrders(editionId)
    /** The orders whose add-ons a ticket's row lists: its own, and the paid ones on its code. */
    const withTicket = (orderId: string) => {
      const code = carried.find((row) => row.orderId === orderId)?.qrCodeId
      return new Set([
        orderId,
        ...carried
          .filter((row) => code && row.qrCodeId === code && isPaid(row.status))
          .map((row) => row.orderId),
      ])
    }
    const columns = ticketHolderColumns
    const header = [
      ...[columns.number, columns.status, columns.holder, columns.ageBand].map((c) => i18n._(c)),
      ...[columns.ticketType, columns.addOns].map((c) => i18n._(c)),
      // What the edition asks a ticket holder, each under its own label.
      ...fields.map((field) => field.label),
      i18n._(columns.email),
      i18n._(columns.placed),
    ]
    const rows = (await this.sales.ticketOrders(editionId, LISTED)).map((order) => {
      const listed = withTicket(order.id)
      return [
        order.number,
        i18n._(exportNames.orderStatus[order.status]),
        order.holderName,
        order.ageBand ? i18n._(exportNames.ageBand[order.ageBand]) : '',
        order.ticketType,
        addOns
          .filter((line) => listed.has(line.orderId))
          .map((line) => line.name)
          .join(', '),
        ...fields.map(
          (field) =>
            answers.find((row) => row.orderId === order.id && row.fieldId === field.id)?.answer ??
            '',
        ),
        order.email ?? '',
        moment(order.placedAt),
      ]
    })
    return this.file(editionId, 'ticket-holders', [header, ...rows])
  }

  /** The merchandise pick list (E3): a row a merchandise line of a paid order. */
  async merchandisePickList(editionId: string, language: string | undefined) {
    const { i18n, moment } = await this.written(language)
    const rows = (await this.sales.merchandiseLines(editionId)).map((line) => [
      line.number,
      line.holderName,
      line.item,
      line.variant.join(', '),
      line.quantity,
      moment(line.handedOutAt),
    ])
    return this.file(editionId, 'merchandise-pick-list', [
      this.header(i18n, pickListColumns),
      ...rows,
    ])
  }

  /** The payments list (E4): a row a payment attempt, with what its provider's module keeps. */
  async payments(editionId: string, language: string | undefined) {
    const { i18n, locale, moment } = await this.written(language)
    const amount = (minor: number | null | undefined) =>
      minor === null || minor === undefined ? '' : amountCell(minor, locale)
    const rows = (await this.sales.attempts(editionId)).map((attempt) => {
      const information = attempt.information ?? {}
      const commission = information.commissionMinor
      return [
        attempt.number,
        attempt.provider,
        i18n._(exportNames.attemptStatus[attempt.status]),
        amount(attempt.amountMinor),
        amount(attempt.paidAmountMinor),
        attempt.currency,
        moment(attempt.paidAt),
        attempt.moneyWith ? i18n._(exportNames.moneyWith[attempt.moneyWith]) : '',
        information.transaction ?? attempt.providerReference ?? '',
        information.batch ?? '',
        commission !== undefined && /^\d+$/.test(commission) ? amount(Number(commission)) : '',
        Object.entries(information)
          .filter(([name]) => !KNOWN.includes(name))
          .map(([name, value]) => `${name}: ${value}`)
          .join('; '),
      ]
    })
    return this.file(editionId, 'payments', [this.header(i18n, paymentColumns), ...rows])
  }
}
