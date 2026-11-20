import { timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { type OrderResult, RESULT_TOKEN_HOURS, type StartedAttempt } from '@opos/contract'
import { parseAcceptLanguage } from '@opos/i18n'
import { TenantContextService, type TenantInContext } from '../../common/als/tenant-context.service'
import { notFound } from '../../common/errors/api-error'
import { ENV, type Env } from '../../config/env'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type Credentials } from '../payments/provider'
import { providerUnavailable } from '../shop/shop.errors'
import { alreadyPaid, holdEnded } from './checkout.errors'
import { hashOf } from './codes'
import { attemptOf, PaymentConfirmations } from './payment-confirmations.service'
import { type PayableOrder, PaymentsRepository } from './payments.repository'

const HOUR = 3_600_000

/**
 * Who opens an order: a visitor's tab by the order's result token, or a signed-in account by its
 * own order of the edition the address names. An account's tab may send the token too, for the
 * address the buyer returns to.
 */
export type Opener = { token: string } | { accountId: string; editionId: string; token?: string }

/**
 * The payment attempts of an order and what its result page shows
 * (docs/specs/0004-checkout-and-orders.md, Y1-Y4, R1-R5). Every method runs outside every
 * transaction and opens the tenant's own: a provider is never asked inside one.
 */
@Injectable()
export class PaymentAttempts {
  private readonly apiUrl: string
  private readonly portalUrl: string

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly confirmations: PaymentConfirmations,
    private readonly providers: PaymentProviders,
    private readonly vault: CredentialsVault,
    private readonly context: TenantContextService,
    @Inject(ENV) env: Pick<Env, 'API_URL' | 'PORTAL_URL'>,
  ) {
    this.apiUrl = env.API_URL.replace(/\/+$/, '')
    this.portalUrl = env.PORTAL_URL.replace(/\/+$/, '')
  }

  /**
   * Starts a payment attempt for the order and answers where to send the buyer. The module is
   * asked about the earlier attempts first: when one was paid, that payment is confirmed instead
   * and no new one starts. `language` is the request's Accept-Language: the provider's pages
   * speak the language of the buyer's interface, or the convention's.
   */
  async start(
    tenant: TenantInContext,
    orderId: string,
    opener: Opener,
    language?: string,
  ): Promise<StartedAttempt> {
    const first = await this.context.withTenant(tenant.id, async () => {
      const order = await this.opened(tenant.id, orderId, opener, new Date())
      this.payable(order, new Date())
      const account = await this.account(tenant.id)
      const earlier = (await this.payments.attempts(order.id)).filter(
        (attempt) => attempt.status === 'started' || attempt.status === 'failed',
      )
      return { order, ...account, earlier }
    })

    for (const attempt of first.earlier) {
      const of = attemptOf(first.order, attempt)
      const answer = await this.providers.state(attempt.provider, first.credentials, of)
      // Unknown whether it was paid: starting another could take the buyer's money twice.
      if (answer.state === 'unavailable') throw providerUnavailable(answer.reason)
      if (answer.state === 'paid') {
        await this.confirmations.take(tenant.id, attempt.id, answer.payment)
        throw alreadyPaid()
      }
    }

    const attemptId = await this.context.withTenant(tenant.id, async () => {
      // The order as it is now, alone, and its opener judged again: it may have been paid or
      // expired, its edition taken back or its token run out while the provider was asked.
      const order = await this.opened(tenant.id, orderId, opener, new Date(), true)
      this.payable(order, new Date())
      return this.payments.addAttempt(order, first.provider)
    })
    const { order } = first
    const token = 'token' in opener ? opener.token : undefined
    const answer = await this.providers.start(first.provider, first.credentials, {
      id: attemptId,
      amountMinor: order.totalMinor,
      currency: order.currency,
      reference: order.number,
      // The convention and the order's number: nothing of the buyer or the ticket holder.
      description: `${tenant.name} ${order.number}`,
      email: order.email ?? '',
      locale: parseAcceptLanguage(language)[0] ?? tenant.defaultLocale,
      // The result page opens with the result token. An account that pays from the list of its
      // orders holds none: it returns to the convention's page, where those orders are.
      returnUrl: token
        ? `${this.portalUrl}/conventions/${tenant.slug}/${order.editionSlug}/shop/result/${order.id}?token=${encodeURIComponent(token)}`
        : `${this.portalUrl}/conventions/${tenant.slug}`,
      // Judged payable a moment ago, so its hold has an end.
      payableUntil: order.holdEndsAt ?? new Date(),
      notificationUrl: `${this.apiUrl}/payments/${first.provider}/notifications/${attemptId}`,
      additionalNotificationUrl: `${this.apiUrl}/payments/${first.provider}/notifications/${attemptId}/additional`,
    })
    if (answer.outcome !== 'started') {
      // Kept as an attempt that ended with no payment: the provider never knew it.
      await this.context.withTenant(tenant.id, () =>
        this.payments.changeAttempt(attemptId, { status: 'ended' }),
      )
      throw providerUnavailable(answer.reason)
    }
    return { redirectUrl: answer.redirectUrl }
  }

  /** What the result page shows of the order: its status and number alone. */
  result(tenant: TenantInContext, orderId: string, token: string): Promise<OrderResult> {
    return this.context.withTenant(tenant.id, async () => {
      const order = await this.opened(tenant.id, orderId, { token }, new Date())
      const attempts = await this.payments.attempts(order.id)
      const last = attempts.at(-1)
      const confirmed = attempts.findLast((attempt) => attempt.moneyWith !== null)
      return {
        number: order.number,
        status: order.status,
        holdEndsAt:
          order.status === 'awaiting-payment' ? (order.holdEndsAt?.toISOString() ?? null) : null,
        // Why the last try failed, for as long as nothing came after it.
        failureReason:
          order.status === 'awaiting-payment' && last?.status === 'failed'
            ? last.failureReason
            : null,
        moneyWith:
          order.status === 'needs-review' && confirmed?.moneyWith
            ? (this.providers.moneyWith(confirmed.provider, confirmed.moneyWith) ?? null)
            : null,
        editionSlug: order.editionSlug,
      }
    })
  }

  /**
   * The order of the tenant its opener may open, or `404`: a published edition's, by its result
   * token for 24 hours from its placing, or the account's own of the edition named. `lock` holds
   * its row until the transaction ends.
   */
  private async opened(
    tenantId: string,
    orderId: string,
    opener: Opener,
    at: Date,
    lock = false,
  ): Promise<PayableOrder> {
    const order = await this.payments.order(tenantId, orderId, lock)
    if (!order?.editionPublished) throw notFound('order')
    if ('accountId' in opener) {
      const own =
        order.editionId === opener.editionId &&
        (await this.payments.isOf(tenantId, order.id, opener.accountId))
      if (!own) throw notFound('order')
      return order
    }
    const given = Buffer.from(hashOf(opener.token))
    const stored = Buffer.from(order.resultTokenHash)
    const fresh = at.getTime() - order.placedAt.getTime() <= RESULT_TOKEN_HOURS * HOUR
    if (given.length !== stored.length || !timingSafeEqual(given, stored) || !fresh) {
      throw notFound('order')
    }
    return order
  }

  /** A payment attempt starts only within the hold of an order that awaits payment. */
  private payable(order: PayableOrder, at: Date) {
    if (order.status === 'expired') throw holdEnded()
    if (order.status !== 'awaiting-payment') throw alreadyPaid()
    if (!order.holdEndsAt || order.holdEndsAt.getTime() <= at.getTime()) throw holdEnded()
  }

  /** The account the order is paid into, with its credentials opened. */
  private async account(tenantId: string) {
    const account = await this.payments.providerAccount(tenantId)
    if (!account || !this.providers.loaded(account.provider)) {
      throw providerUnavailable('the convention has no account of a provider loaded here')
    }
    let credentials: Credentials
    try {
      credentials = this.vault.open({ tenantId, provider: account.provider }, account.credentials)
    } catch {
      // Credentials this API can no longer open, as after its key was replaced.
      throw providerUnavailable('the credentials of the account cannot be opened')
    }
    return { provider: account.provider, credentials }
  }
}
