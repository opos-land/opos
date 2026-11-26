import { Injectable } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { orders, paymentAttempts, paymentProviderAccounts } from '@opos/db'
import { and, eq, exists, gt, isNull, or, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { providerAccountLockKey } from './provider-account-lock'

/**
 * For how long after the hold of an expired order ended a payment started for it may still be
 * confirmed, so that its account stays: a payment starts only within the hold, and a provider
 * repeats the notification of one for hours.
 */
export const LATE_CONFIRMATION_HOURS = 24

export interface StoredProviderAccount {
  provider: PaymentProvider
  /** Sealed: opened by CredentialsVault alone, and carried by no answer. */
  credentials: string
  readyAt: Date | null
  createdAt: Date
}

const columns = {
  provider: paymentProviderAccounts.provider,
  credentials: paymentProviderAccounts.credentials,
  readyAt: paymentProviderAccounts.readyAt,
  createdAt: paymentProviderAccounts.createdAt,
}

/**
 * The payment provider account of the tenant in context, one row a tenant; RLS keeps it inside.
 * Credentials given again are a new row in place of the old: the row is never changed.
 */
@Injectable()
export class ProviderAccountRepository {
  constructor(private readonly context: TenantContextService) {}

  private own() {
    return eq(paymentProviderAccounts.tenantId, this.context.tenant().id)
  }

  async find(): Promise<StoredProviderAccount | undefined> {
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(paymentProviderAccounts)
      .where(this.own())
    return row
  }

  /**
   * What opening a shop asks of the account, without its credentials: its provider, and whether
   * it was ready to sell when it was connected.
   */
  async readiness(): Promise<Pick<StoredProviderAccount, 'provider' | 'readyAt'> | undefined> {
    const [row] = await this.context
      .tx()
      .select({ provider: columns.provider, readyAt: columns.readyAt })
      .from(paymentProviderAccounts)
      .where(this.own())
    return row
  }

  /**
   * Whether a payment of the convention is under way: an order awaits payment, or one expired
   * whose hold ended within the last LATE_CONFIRMATION_HOURS and which has a payment attempt
   * its provider may still confirm, since a payment made counts whenever its confirmation comes.
   * That is an attempt nobody confirmed, but for one its provider refused to register: the
   * provider knows no such attempt and confirms nothing of it. An attempt the provider was asked
   * about once more after the order expired counts on, whatever it answered: "not paid" is not
   * its last word, and a transfer booked later is confirmed with the account. The two share one
   * mark and differ by its moment. A refusal is marked with the moment the attempt started,
   * which is within the hold; asking again is marked an hour after the end of the hold at the
   * earliest. So an attempt marked after the end of its order's hold may still be confirmed, as
   * one not marked at all. The lock on the tenant's provider account is taken first, alone, and
   * an order with something to pay shares it while it is placed: one being placed is waited for
   * and counted, and one placed after waits for the change of the credentials.
   */
  async paymentsUnderWay(now = new Date()): Promise<boolean> {
    const tx = this.context.tx()
    const tenantId = this.context.tenant().id
    await tx.execute(sql`select pg_advisory_xact_lock(${providerAccountLockKey(tenantId)}::bigint)`)
    const since = new Date(now.getTime() - LATE_CONFIRMATION_HOURS * 3_600_000)
    const confirmable = tx
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.tenantId, tenantId),
          eq(paymentAttempts.orderId, orders.id),
          isNull(paymentAttempts.confirmedAt),
          or(
            isNull(paymentAttempts.recheckedAt),
            gt(paymentAttempts.recheckedAt, orders.holdEndsAt),
          ),
        ),
      )
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          or(
            eq(orders.status, 'awaiting-payment'),
            and(eq(orders.status, 'expired'), gt(orders.holdEndsAt, since), exists(confirmable)),
          ),
        ),
      )
      .limit(1)
    return order !== undefined
  }

  /** Removes the account with its credentials; answers whether there was one. */
  async remove(): Promise<boolean> {
    const gone = await this.context
      .tx()
      .delete(paymentProviderAccounts)
      .where(this.own())
      .returning({ tenantId: paymentProviderAccounts.tenantId })
    return gone.length > 0
  }

  async replace(account: {
    provider: PaymentProvider
    credentials: string
    readyAt: Date | null
  }): Promise<StoredProviderAccount> {
    await this.remove()
    const [row] = await this.context
      .tx()
      .insert(paymentProviderAccounts)
      .values({ tenantId: this.context.tenant().id, ...account })
      .returning(columns)
    return row!
  }
}
