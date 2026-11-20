import { Inject, Injectable } from '@nestjs/common'
import { type OpenedOrderLink } from '@opos/contract'
import { open, orderQrCodeOf, sealingKey } from '@opos/db/sealed'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound, suspendedAsNotFound } from '../../common/errors/api-error'
import { ENV, type Env } from '../../config/env'
import { hashOf } from '../checkout/codes'
import { OrdersRepository } from '../checkout/orders.repository'
import { OrderLinksRepository, type OrderOfLink } from './order-links.repository'

/** A fresh link is sent for an order at most this often, however often it is asked for. */
export const FRESH_LINK_EVERY_MS = 60 * 60_000

/**
 * The order link (docs/specs/0009-buyer-self-service.md, K1-K5): an emailed link that opens one
 * order without a sign-in. A token names no tenant: the link is found across tenants by the hash
 * of its token, which answers its tenant alone, and everything else is read in that tenant's own
 * transaction.
 */
@Injectable()
export class OrderLinks {
  private readonly key: Buffer

  constructor(
    private readonly global: GlobalDbService,
    private readonly links: OrderLinksRepository,
    private readonly orders: OrdersRepository,
    private readonly context: TenantContextService,
    @Inject(ENV) env: Pick<Env, 'PAYMENT_CREDENTIALS_KEY'>,
  ) {
    // The key that seals what the API alone opens; a QR code is sealed for its own row.
    this.key = sealingKey(env.PAYMENT_CREDENTIALS_KEY)
  }

  /**
   * The link a token names with its order, in its tenant's transaction; undefined for a token
   * nobody made, a link a changed email ended, a suspended convention and an edition taken back.
   */
  private async found<T>(
    token: string,
    then: (order: OrderOfLink, expired: boolean) => Promise<T>,
    now: Date,
    lock = false,
  ): Promise<T | undefined> {
    const tokenHash = hashOf(token)
    const tenantId = await this.global.orderLinkTenant(tokenHash)
    if (!tenantId) return undefined
    return this.context.withTenant(tenantId, async () => {
      const link = await this.links.byHash(tenantId, tokenHash)
      if (!link || link.endedAt) return undefined
      const order = await this.links.order(tenantId, link.orderId, lock)
      if (!order) return undefined
      return then(order, link.expiresAt.getTime() <= now.getTime())
    })
  }

  /** What the link opens: its order, or for an expired link only that it expired. */
  async open(token: string, now = new Date()): Promise<OpenedOrderLink> {
    const opened = await this.found<OpenedOrderLink>(
      token,
      async (order, expired) => {
        if (expired) return { state: 'expired' }
        const { id, tenantId, editionId } = order
        // The code is shown while the order is paid: a canceled one is refused at the gate.
        const sealed = order.status === 'paid' ? await this.links.qrCode(tenantId, id) : undefined
        return {
          state: 'valid',
          order: {
            number: order.number,
            status: order.status,
            placedAt: order.placedAt,
            convention: order.convention,
            edition: order.edition,
            totalMinor: order.totalMinor,
            currency: order.currency,
            lines: await this.links.lines(tenantId, id),
            qrCode: sealed ? open(this.key, sealed.code, orderQrCodeOf(tenantId, sealed.id)) : null,
            pickupInformation: await this.links.pickupInformation(tenantId, editionId),
          },
        }
      },
      now,
    ).catch(suspendedAsNotFound('order link'))
    if (!opened) throw notFound('order link')
    return opened
  }

  /**
   * Queues a fresh link to the order's email for an expired link, at most once an hour for an
   * order. It answers nothing, so that asking tells nothing of a token: whether it was ever a
   * link, still opens or was ended.
   */
  async renew(token: string, now = new Date()): Promise<void> {
    await this.found(
      token,
      async (order, expired) => {
        if (!expired || order.email === null) return
        const since = new Date(now.getTime() - FRESH_LINK_EVERY_MS)
        if (await this.links.linkQueuedSince(order.tenantId, order.id, since)) return
        await this.orders.queueEmail(
          { tenantId: order.tenantId, editionId: order.editionId, orderId: order.id },
          'order-link',
          order.email,
        )
      },
      now,
      // Under the lock of the order's row: one fresh link an hour, however many ask at once.
      true,
    )
      .catch(suspendedAsNotFound('order link'))
      // A suspended convention answers as any token does.
      .catch(() => undefined)
  }
}
