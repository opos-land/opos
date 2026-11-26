import { Controller, Inject } from '@nestjs/common'
import { contract, type ProviderAccount } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ENV, type Env } from '../../config/env'
import { Prepares } from '../../common/decorators/prepares.decorator'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type CheckedCredentials, ConnectProviderPreparation } from './connect-provider.preparation'
import { EditionShopsRepository } from './edition-shops.repository'
import {
  ProviderAccountRepository,
  type StoredProviderAccount,
} from './provider-account.repository'
import { isComplete, SellerRepository } from './seller.repository'
import { credentialsRefused, paymentsUnderWay, providerUnavailable, shopOpen } from './shop.errors'

/**
 * What belongs to the whole convention of its shop, behind the shop permission: the seller's
 * details and the convention's own payment provider account (docs/specs/0002-shop-setup.md).
 */
@Controller()
export class ShopController {
  constructor(
    private readonly sellers: SellerRepository,
    private readonly accounts: ProviderAccountRepository,
    private readonly shops: EditionShopsRepository,
    private readonly providers: PaymentProviders,
    private readonly vault: CredentialsVault,
    private readonly context: TenantContextService,
    @Inject(ENV) private readonly env: Pick<Env, 'API_EGRESS_ADDRESS'>,
  ) {}

  /** What the provider account's screen shows beside the account itself. */
  private around() {
    return {
      providers: this.providers.names(),
      // For a provider that answers only to the addresses entered in its panel.
      callsFrom: this.env.API_EGRESS_ADDRESS ?? null,
    }
  }

  @Implement(contract.shop.seller.get)
  @RequireTenant('shop', 'read')
  seller() {
    return implement(contract.shop.seller.get).handler(() => this.sellers.get())
  }

  /** The details cannot be made incomplete while a shop of the convention is open. */
  @Implement(contract.shop.seller.put)
  @RequireTenant('shop', 'write')
  putSeller() {
    return implement(contract.shop.seller.put).handler(async ({ input }) => {
      if (!isComplete(input.body) && (await this.shops.anyOpen())) throw shopOpen()
      return this.sellers.put(input.body)
    })
  }

  @Implement(contract.shop.providerAccount.get)
  @RequireTenant('shop', 'read')
  providerAccount() {
    return implement(contract.shop.providerAccount.get).handler(async () => {
      const account = await this.accounts.find()
      return { account: account ? this.shown(account) : null, ...this.around() }
    })
  }

  /**
   * The credentials were checked with the provider before this transaction: refused ones and a
   * provider out of reach store nothing, and the account the convention had stays. Accepted ones
   * take the place of the stored, sealed.
   */
  @Implement(contract.shop.providerAccount.put)
  @RequireTenant('shop', 'write')
  @Prepares(ConnectProviderPreparation)
  connectProviderAccount() {
    return implement(contract.shop.providerAccount.put).handler(async () => {
      const { provider, credentials, answer, stored } = this.context.prepared<CheckedCredentials>()
      // Whatever the provider said of the new credentials, the stored ones stay while a payment
      // that started with them is under way, unless they were found to give way. That was found
      // before this transaction, of the credentials stored then: others stored since stay.
      if (await this.accounts.paymentsUnderWay()) {
        const current = await this.accounts.find()
        if (!stored?.givesWay || stored.credentials !== current?.credentials) {
          throw paymentsUnderWay()
        }
      }
      if (answer.outcome === 'refused') throw credentialsRefused()
      if (answer.outcome === 'unavailable') throw providerUnavailable(answer.reason)
      // An open shop keeps a ready account: credentials that leave it not ready wait for the
      // shop to close, as disconnecting does.
      if (answer.outcome !== 'ready' && (await this.shops.anyOpen())) throw shopOpen()
      const account = await this.accounts.replace({
        provider,
        credentials: this.vault.seal({ tenantId: this.context.tenant().id, provider }, credentials),
        readyAt: answer.outcome === 'ready' ? new Date() : null,
      })
      return { account: this.shown(account), ...this.around() }
    })
  }

  /**
   * Disconnecting removes the credentials. It is refused while a shop of the convention is open,
   * and while an order awaits payment: its payment is confirmed with them.
   */
  @Implement(contract.shop.providerAccount.remove)
  @RequireTenant('shop', 'write')
  disconnectProviderAccount() {
    return implement(contract.shop.providerAccount.remove).handler(async () => {
      if (await this.shops.anyOpen()) throw shopOpen()
      if (await this.accounts.paymentsUnderWay()) throw paymentsUnderWay()
      await this.accounts.remove()
    })
  }

  /**
   * The account as the panel shows it: never its credentials, opened here only to ask what they
   * miss. Credentials this API can no longer open, as after its key was replaced, leave the
   * account not ready until its convention gives them again.
   */
  private shown(account: StoredProviderAccount): ProviderAccount {
    let missing: string[]
    try {
      const sealedFor = { tenantId: this.context.tenant().id, provider: account.provider }
      missing = this.providers.missing(
        account.provider,
        this.vault.open(sealedFor, account.credentials),
      )
    } catch {
      missing = ['credentials.unreadable']
    }
    return {
      provider: account.provider,
      connectedAt: account.createdAt.toISOString(),
      ready: account.readyAt !== null && missing.length === 0,
      missing,
    }
  }
}
