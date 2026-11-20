import { Injectable } from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type AttemptOf, type Credentials, type ReportedPayment } from '../payments/provider'
import { providerUnavailable } from '../shop/shop.errors'
import { OrderSettlement } from './order-settlement.service'
import { OrdersRepository } from './orders.repository'
import { type PayableOrder, PaymentsRepository, type StoredAttempt } from './payments.repository'

/**
 * What a payment does of its order: it pays it, sends it to review, or is one the order no
 * longer needs. A repeat is a payment already taken, which changes nothing.
 */
export type Confirmation = 'paid' | 'review' | 'not-needed' | 'repeat'

type Decision = Exclude<Confirmation, 'repeat'>

interface Found {
  order: PayableOrder
  attempt: StoredAttempt
  credentials: Credentials
}

/** An attempt as the provider's module is asked about it. */
export const attemptOf = (order: PayableOrder, attempt: StoredAttempt): AttemptOf => ({
  id: attempt.id,
  amountMinor: attempt.amountMinor,
  currency: order.currency,
  reference: order.number,
})

/**
 * Takes a payment a provider's module reports of an attempt
 * (docs/specs/0004-checkout-and-orders.md, Y5-Y11), in three steps: a transaction that locks the
 * order with its limits and decides what the payment does; the module's `settle` or `refuse`,
 * outside every transaction; a transaction that writes the outcome. The order becomes "Paid" only
 * in the last one, so a `settle` that did not answer leaves the order as it was, and the payment
 * is taken again when the provider repeats its notification.
 */
@Injectable()
export class PaymentConfirmations {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly settlement: OrderSettlement,
    private readonly providers: PaymentProviders,
    private readonly vault: CredentialsVault,
    private readonly context: TenantContextService,
  ) {}

  /** Runs outside every transaction: it opens the tenant's own. */
  async take(
    tenantId: string,
    attemptId: string,
    payment: ReportedPayment,
    at = new Date(),
  ): Promise<Confirmation> {
    const first = await this.context.withTenant(tenantId, async () => {
      const found = await this.locked(tenantId, attemptId)
      if (!found) return undefined
      return { ...found, decision: await this.decide(found.order, payment) }
    })
    // An attempt already confirmed, or one whose account is gone: nothing is asked of a provider.
    if (!first || first.attempt.confirmedAt) return 'repeat'

    const { provider } = first.attempt
    const of = attemptOf(first.order, first.attempt)
    let refused = false
    if (first.decision === 'not-needed') {
      // Refused where the provider can: the money then stays with the buyer.
      refused = (await this.providers.refuse(provider, first.credentials, of, payment)).refused
    } else {
      // Also for a payment that sends its order to review: the money is then with the
      // convention, for an org to settle.
      const answer = await this.providers.settle(provider, first.credentials, of, payment)
      if (answer.outcome !== 'settled') throw providerUnavailable(answer.reason)
    }
    const taken = first.decision !== 'not-needed' || !refused
    const information = taken
      ? await this.providers.information(provider, first.credentials, of, payment)
      : {}

    return this.context.withTenant(tenantId, async () => {
      const found = await this.locked(tenantId, attemptId)
      // Taken meanwhile by another request for the same notification.
      if (!found || found.attempt.confirmedAt) return 'repeat'
      const { order, attempt } = found
      await this.payments.changeAttempt(attempt.id, {
        status: taken ? 'paid' : 'refused',
        paidAmountMinor: payment.paidAmountMinor,
        paidAt: payment.paidAt,
        confirmedAt: at,
        moneyWith: taken ? 'convention' : 'buyer',
        providerReference: payment.providerReference,
        information,
      })
      // The order as it is now: it may have been paid or expired since the first step decided.
      const decision =
        first.decision === 'not-needed' ? 'not-needed' : await this.decide(order, payment)
      const of = { tenantId, editionId: order.editionId, orderId: order.id }
      if (decision === 'paid') {
        // An expired order takes again what it held; one awaiting payment holds it already.
        await this.payments.changeOrder(order.id, {
          status: 'paid',
          holds: true,
          holdEndsAt: null,
          paidAt: at,
        })
        if (order.email) await this.settlement.paid({ ...of, email: order.email })
        return 'paid'
      }
      const orgs = await this.payments.orgs(tenantId, order.editionId)
      if (decision === 'review') {
        // It keeps what it still holds until an org settles it, and takes nothing it let go.
        await this.payments.changeOrder(order.id, {
          status: 'needs-review',
          // Another amount than the total, or the right one for what is no longer there.
          reviewCause: payment.paidAmountMinor === order.totalMinor ? 'unavailable' : 'amount',
        })
        if (order.email) await this.orders.queueEmail(of, 'payment-under-review', order.email)
        for (const org of orgs) await this.orders.queueEmail(of, 'needs-review', org)
        return 'review'
      }
      // A payment the order does not need changes nothing of it. The buyer is told where the
      // money is; the orgs are alerted when it is with the convention, for them to return.
      if (order.email) await this.orders.queueEmail(of, 'payment-not-needed', order.email)
      if (taken)
        for (const org of orgs) await this.orders.queueEmail(of, 'payment-not-needed-orgs', org)
      return 'not-needed'
    })
  }

  /**
   * The attempt with its order locked, and the credentials of the account it is paid into, opened.
   * Undefined when the attempt, or an account of its provider, is not there.
   */
  private async locked(tenantId: string, attemptId: string): Promise<Found | undefined> {
    const attempt = await this.payments.attempt(attemptId)
    if (!attempt) return undefined
    const order = await this.payments.order(tenantId, attempt.orderId, true)
    const account = await this.payments.providerAccount(tenantId)
    if (!order || account?.provider !== attempt.provider) return undefined
    // Read again under the order's lock: another request may have confirmed it meanwhile.
    const current = (await this.payments.attempt(attemptId))!
    const credentials = this.vault.open(
      { tenantId, provider: account.provider },
      account.credentials,
    )
    return { order, attempt: current, credentials }
  }

  /**
   * What a payment does of the order as it stands. For an expired one it locks the limits the
   * order's lines touch before it counts, as placing an order does.
   */
  private async decide(order: PayableOrder, payment: ReportedPayment): Promise<Decision> {
    if (order.status !== 'awaiting-payment' && order.status !== 'expired') return 'not-needed'
    // An amount that differs from the total never pays the order.
    if (payment.paidAmountMinor !== order.totalMinor) return 'review'
    if (order.status === 'awaiting-payment') return 'paid'
    const cart = await this.payments.cart(order.id)
    await this.orders.lockLimits(order.editionId, cart)
    return (await this.payments.stillThere(order.editionId, cart)) ? 'paid' : 'review'
  }
}
