import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService, type JobScope } from '../../common/database/global-db.service'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type Credentials } from '../payments/provider'
import { OrdersRepository } from './orders.repository'
import { attemptOf, PaymentConfirmations } from './payment-confirmations.service'
import { PaymentsRepository } from './payments.repository'

/** How often the job looks for orders whose hold ended. */
const EXPIRY_EVERY_MS = 60_000

/** How many orders one page of a run holds, and how many pages a run reads at most. */
const EXPIRY_PAGE = 200
const MAX_PAGES = 50

/**
 * When an attempt of an expired order nobody confirmed is asked about once more: from an hour
 * after the end of the order's hold, and for no longer than 24 hours after it. An order keeps no
 * moment of its expiry, so both run from the end of its hold.
 */
const ASK_AGAIN_AFTER_MS = 60 * 60_000
const ASK_AGAIN_UNTIL_MS = 24 * 60 * 60_000

/** What one run made of the orders it found: expired, paid after all, or left to wait. */
export interface ExpiryResult {
  expired: number
  paid: number
  waiting: number
}

/**
 * What one run made of the attempts it asked about again: a payment taken, an attempt nobody
 * paid, or one left for the next run.
 */
export interface AskAgainResult {
  taken: number
  unpaid: number
  waiting: number
}

/**
 * The expiry job (docs/specs/0004-checkout-and-orders.md, Y6, H3): every minute it finds the
 * orders awaiting payment whose hold ended and asks the provider's module about their open
 * attempts. A payment made is confirmed, whenever it is found; with none the order expires,
 * releases what it held and its buyer is told. An order whose provider cannot be asked waits:
 * whether it was paid is not known. Several API processes may run it at once: an order is
 * claimed under a lock the others skip.
 *
 * After each run it asks once more about the attempts of the orders that expired
 * (docs/ARCHITECTURE.md, Modules waiting for their domain owner): a payment its provider settled
 * whose answer was lost left no trace, and the provider repeats nothing of it. An attempt nobody
 * confirmed is asked about once, an hour after the end of its order's hold, and marked; a payment
 * found is taken as any late one is. A provider out of reach leaves the attempt for the next
 * run, for 24 hours from the end of the hold at most.
 */
@Injectable()
export class OrderExpiry implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderExpiry.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly global: GlobalDbService,
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly confirmations: PaymentConfirmations,
    private readonly providers: PaymentProviders,
    private readonly vault: CredentialsVault,
    private readonly context: TenantContextService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    const run = () => {
      this.run()
        .catch((error: unknown) => this.logger.error(`The expiry failed: ${String(error)}`))
        .then(() => this.recheck())
        .catch((error: unknown) => this.logger.error(`Asking again failed: ${String(error)}`))
        .finally(() => (this.timer = setTimeout(run, EXPIRY_EVERY_MS).unref()))
    }
    this.timer = setTimeout(run, EXPIRY_EVERY_MS).unref()
  }

  onApplicationShutdown() {
    clearTimeout(this.timer)
  }

  /**
   * One run over the orders whose hold has ended by `now`, a page at a time, each page after the
   * last order of the one before: an order left to wait holds no other order back, of its own
   * tenant or of another.
   */
  async run(now = new Date(), scope: JobScope = {}): Promise<ExpiryResult> {
    const result: ExpiryResult = { expired: 0, paid: 0, waiting: 0 }
    let after: { holdEndsAt: Date; id: string } | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const due = await this.global.ordersPastHold(now, { ...scope, after })
      for (const { id, tenantId } of due) {
        try {
          result[await this.one(tenantId, id, now)] += 1
        } catch (error) {
          // One order that fails, such as one of a tenant suspended meanwhile, leaves the rest.
          // Only the error's name goes to the log: its message may quote an address.
          result.waiting += 1
          const name = error instanceof Error ? error.name : 'unknown failure'
          this.logger.warn(`The expiry left the order ${id} as it was: ${name}`)
        }
      }
      const last = due.at(-1)
      if (!last || due.length < (scope.limit ?? EXPIRY_PAGE)) break
      after = { holdEndsAt: last.holdEndsAt, id: last.id }
    }
    return result
  }

  private async one(tenantId: string, orderId: string, now: Date): Promise<keyof ExpiryResult> {
    const read = await this.context.withTenant(tenantId, async () => {
      const order = await this.payments.order(tenantId, orderId)
      if (order?.status !== 'awaiting-payment') return undefined
      const open = (await this.payments.attempts(orderId)).filter(
        (attempt) => attempt.status === 'started' || attempt.status === 'failed',
      )
      const account = open.length > 0 ? await this.payments.providerAccount(tenantId) : undefined
      return { order, open, account }
    })
    // Paid or expired since it was found.
    if (!read) return 'waiting'
    const { order, open, account } = read

    for (const attempt of open) {
      // An attempt whose provider cannot be asked may have been paid: the order waits.
      if (!account) return 'waiting'
      // The account the attempt started with gave way to one of another provider, which it does
      // under a payment only once nothing is confirmed with it again (docs/ARCHITECTURE.md,
      // Modules waiting for their domain owner): nobody is left to ask, as when the new account
      // of the same provider knows no such payment.
      if (account.provider !== attempt.provider) continue
      let credentials: Credentials
      try {
        credentials = this.vault.open({ tenantId, provider: account.provider }, account.credentials)
      } catch {
        return 'waiting'
      }
      const answer = await this.providers.state(
        attempt.provider,
        credentials,
        attemptOf(order, attempt),
      )
      if (answer.state === 'unavailable') return 'waiting'
      if (answer.state === 'paid') {
        await this.confirmations.take(tenantId, attempt.id, answer.payment, now)
        return 'paid'
      }
    }

    const expired = await this.context.withTenant(tenantId, async () => {
      if (!(await this.payments.expire(orderId, now))) return false
      if (order.email) {
        await this.orders.queueEmail(
          { tenantId, editionId: order.editionId, orderId },
          'order-expired',
          order.email,
        )
      }
      return true
    })
    return expired ? 'expired' : 'waiting'
  }

  /**
   * One run over the attempts to ask about again by `now`, a page at a time, each page after the
   * last attempt of the one before: an attempt left for the next run holds no other one back.
   */
  async recheck(now = new Date(), scope: JobScope = {}): Promise<AskAgainResult> {
    const result: AskAgainResult = { taken: 0, unpaid: 0, waiting: 0 }
    const window = {
      from: new Date(now.getTime() - ASK_AGAIN_UNTIL_MS),
      to: new Date(now.getTime() - ASK_AGAIN_AFTER_MS),
    }
    let after: { holdEndsAt: Date; id: string } | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const due = await this.global.attemptsToAskAgain(window, { ...scope, after })
      for (const { id, tenantId } of due) {
        try {
          const made = await this.again(tenantId, id, now)
          if (made) result[made] += 1
        } catch (error) {
          // A payment found that could not be settled, or a tenant suspended meanwhile: the
          // attempt stays to ask about. Only the error's name goes to the log.
          result.waiting += 1
          const name = error instanceof Error ? error.name : 'unknown failure'
          this.logger.warn(`Asking again left the attempt ${id} as it was: ${name}`)
        }
      }
      const last = due.at(-1)
      if (!last || due.length < (scope.limit ?? EXPIRY_PAGE)) break
      after = { holdEndsAt: last.holdEndsAt, id: last.id }
    }
    return result
  }

  /**
   * Asks the provider about one attempt, once: the attempt is marked when the provider answered,
   * after a payment it reports was taken. Undefined for an attempt that is no longer one to ask
   * about. The provider is asked outside every transaction, and nothing is written before it
   * answers: a process that dies meanwhile leaves the attempt to the next run.
   */
  private async again(
    tenantId: string,
    attemptId: string,
    now: Date,
  ): Promise<keyof AskAgainResult | undefined> {
    const read = await this.context.withTenant(tenantId, async () => {
      const attempt = await this.payments.attempt(attemptId)
      if (!attempt || attempt.confirmedAt || attempt.recheckedAt) return undefined
      const order = await this.payments.order(tenantId, attempt.orderId)
      if (order?.status !== 'expired') return undefined
      return { order, attempt, account: await this.payments.providerAccount(tenantId) }
    })
    // Confirmed, asked about, or its order paid by another attempt, since it was found.
    if (!read) return undefined
    const { order, attempt, account } = read
    // No account to ask now: whether it was paid is not known.
    if (!account) return 'waiting'

    let taken = false
    // An account of another provider leaves nobody to ask, as it does at the expiry.
    if (account.provider === attempt.provider) {
      let credentials: Credentials
      try {
        credentials = this.vault.open({ tenantId, provider: account.provider }, account.credentials)
      } catch {
        return 'waiting'
      }
      const answer = await this.providers.state(
        attempt.provider,
        credentials,
        attemptOf(order, attempt),
      )
      if (answer.state === 'unavailable') return 'waiting'
      if (answer.state === 'paid') {
        // It decides as for every late payment, and throws while the payment cannot be settled.
        await this.confirmations.take(tenantId, attempt.id, answer.payment, now)
        taken = true
      }
    }
    await this.context.withTenant(tenantId, () =>
      this.payments.changeAttempt(attempt.id, { recheckedAt: now }),
    )
    return taken ? 'taken' : 'unpaid'
  }
}
