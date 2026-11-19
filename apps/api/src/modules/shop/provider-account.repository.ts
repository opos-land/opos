import { Injectable } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { paymentProviderAccounts } from '@opos/db'
import { eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

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
