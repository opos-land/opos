import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { orderQrCodeOf, seal, sealingKey } from '@opos/db/sealed'
import { ENV, type Env } from '../../config/env'
import { hashOf, qrCode } from './codes'
import { OrdersRepository } from './orders.repository'

/**
 * What follows from an order being paid (docs/specs/0004-checkout-and-orders.md, Y5, A2, A5): it
 * gets its one QR code, it is attached to the account whose confirmed email it was paid under,
 * and its confirmation is queued. It runs in the transaction that made the order paid.
 */
@Injectable()
export class OrderSettlement {
  private readonly key: Buffer

  constructor(
    private readonly orders: OrdersRepository,
    @Inject(ENV) env: Pick<Env, 'PAYMENT_CREDENTIALS_KEY'>,
  ) {
    // The key that seals what the API alone opens; each value is sealed for its own row.
    this.key = sealingKey(env.PAYMENT_CREDENTIALS_KEY)
  }

  async paid(order: { tenantId: string; editionId: string; orderId: string; email: string }) {
    const { email, ...of } = order
    const id = randomUUID()
    const code = qrCode()
    await this.orders.addQrCode(of, {
      id,
      codeHash: hashOf(code),
      code: seal(this.key, code, orderQrCodeOf(order.tenantId, id)),
    })
    // A visitor's order under the confirmed email of an account is that account's from now on;
    // one placed signed in is attached already.
    const owner = await this.orders.accountOf(email)
    if (owner) await this.orders.attach(of, owner)
    await this.orders.queueEmail(of, 'order-confirmation', email)
  }
}
