import { setupI18n } from '@lingui/core'
import { Injectable } from '@nestjs/common'
import { type ProductionNumbers } from '@opos/contract'
import { editions, editionShops, orderLines, orders } from '@opos/db'
import { activateLocale } from '@opos/i18n'
import { productionNumbersColumns } from '@opos/i18n/exports'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { csvFile } from '../../common/csv'
import { notFound } from '../../common/errors/api-error'
import { MerchandiseRepository } from '../catalog/merchandise.repository'
import { recipientLocale } from '../mail/recipient-locale'
import { beforeDeadline } from './order-management.errors'

/** The statuses of the orders the numbers count: nobody picks up what the others held. */
const COUNTED = ['paid', 'paid-manual', 'awaiting-payment', 'needs-review'] as const

/**
 * The production numbers of the merchandise of an edition of the tenant in context
 * (docs/specs/0006-order-management.md, S2 and S3): the count of every variant, read once the
 * pre-order deadline has passed. RLS keeps every query inside the tenant, and every count is of
 * the edition of the path, whose permission the request was checked against.
 */
@Injectable()
export class ProductionNumbersService {
  constructor(
    private readonly context: TenantContextService,
    private readonly items: MerchandiseRepository,
  ) {}

  async of(editionId: string, now = new Date()): Promise<ProductionNumbers> {
    const tx = this.context.tx()
    const [shop] = await tx
      .select({ deadline: editionShops.merchPreorderDeadline })
      .from(editionShops)
      .where(eq(editionShops.editionId, editionId))
    const deadline = shop?.deadline ?? null
    // An edition that set no deadline takes no pre-order: its numbers wait for nothing.
    if (deadline && deadline.getTime() > now.getTime()) throw beforeDeadline(deadline)

    const counts = await tx
      .select({
        variantId: orderLines.merchandiseVariantId,
        status: orders.status,
        quantity: sql<number>`sum(${orderLines.quantity})::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orders.editionId, editionId),
          isNotNull(orderLines.merchandiseVariantId),
          inArray(orders.status, [...COUNTED]),
        ),
      )
      .groupBy(orderLines.merchandiseVariantId, orders.status)
    const count = (variantId: string, ...statuses: (typeof COUNTED)[number][]) =>
      counts
        .filter(
          (row) =>
            row.variantId === variantId && (statuses as readonly string[]).includes(row.status),
        )
        .reduce((sum, row) => sum + row.quantity, 0)

    return {
      deadline: deadline?.toISOString() ?? null,
      // Every item and every variant, hidden ones too: an order may hold what the shop no
      // longer shows.
      items: (await this.items.list(editionId)).map((item) => ({
        itemId: item.id,
        name: item.name,
        variants: item.variants.map((variant) => ({
          variantId: variant.id,
          labels: item.axes.flatMap(
            (axis) => axis.values.find((value) => variant.valueIds.includes(value.id))?.label ?? [],
          ),
          paid: count(variant.id, 'paid', 'paid-manual'),
          awaitingPayment: count(variant.id, 'awaiting-payment'),
          needsReview: count(variant.id, 'needs-review'),
        })),
      })),
    }
  }

  /**
   * The numbers as a file named after the edition, a row a variant, its columns in the language
   * of the account that asks: its own, or the convention's where it chose none.
   */
  async file(editionId: string, now = new Date()) {
    const numbers = await this.of(editionId, now)
    const [edition] = await this.context
      .tx()
      .select({ slug: editions.slug })
      .from(editions)
      .where(eq(editions.id, editionId))
    if (!edition) throw notFound('edition')
    const i18n = setupI18n()
    await activateLocale(
      i18n,
      recipientLocale({
        account: this.context.account().locale,
        tenant: this.context.tenant().defaultLocale,
      }),
    )
    const columns = productionNumbersColumns
    const rows = numbers.items.flatMap((item) =>
      item.variants.map((variant) => [
        item.name,
        variant.labels.join(', '),
        variant.paid,
        variant.awaitingPayment,
        variant.needsReview,
      ]),
    )
    const header = [
      columns.item,
      columns.variant,
      columns.paid,
      columns.awaitingPayment,
      columns.needsReview,
    ].map((column) => i18n._(column))
    return {
      headers: {
        'content-disposition': `attachment; filename="production-numbers-${edition.slug}.csv"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
      body: new Blob([csvFile([header, ...rows])], { type: 'text/csv; charset=utf-8' }),
    }
  }
}
