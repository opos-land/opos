import { Injectable } from '@nestjs/common'
import { type PaymentProvider, putProviderAccountSchema } from '@opos/contract'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { type Preparation } from '../../common/decorators/prepares.decorator'
import { ApiError } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type ConnectAnswer, type Credentials } from '../payments/provider'
import {
  ProviderAccountRepository,
  type StoredProviderAccount,
} from './provider-account.repository'

/** The credentials an org gave and what their provider said of them. */
export interface CheckedCredentials {
  provider: PaymentProvider
  credentials: Credentials
  answer: Exclude<ConnectAnswer, { outcome: 'unknown-provider' }>
  /**
   * The account the convention had when its provider was asked, by its sealed credentials, and
   * whether it gives way to the new ones while a payment is under way. What was judged holds of
   * these credentials alone: the route compares them with the ones it finds stored.
   */
  stored?: { credentials: string; givesWay: boolean }
}

/**
 * Before the transaction that connects a provider account: the credentials are checked with the
 * provider, a call out that no transaction waits for. The body is read as it came, so it is
 * validated here as the contract validates it again inside the route.
 */
@Injectable()
export class ConnectProviderPreparation implements Preparation<CheckedCredentials> {
  constructor(
    private readonly providers: PaymentProviders,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
    private readonly accounts: ProviderAccountRepository,
    private readonly vault: CredentialsVault,
  ) {}

  async prepare(body: unknown): Promise<CheckedCredentials> {
    const parsed = putProviderAccountSchema.safeParse(body)
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? 'body')
      throw new ApiError(400, 'request.invalid', 'The provider account is malformed', { field })
    }
    const { provider, credentials } = parsed.data
    // A provider OPOS knows, with no module loaded in this environment.
    const unknown = () =>
      new ApiError(400, 'request.invalid', 'This provider is not available here', {
        field: 'provider',
      })
    if (!this.providers.loaded(provider)) throw unknown()
    // The provider sees every check as coming from OPOS: a convention spends only so many, so
    // that guessed credentials never get OPOS throttled for every other convention.
    const tenantId = this.context.tenant().id
    await this.limiter.consume('providerConnects', `tenant:${tenantId}`)
    const answer = await this.providers.connect(provider, credentials)
    if (answer.outcome === 'unknown-provider') throw unknown()
    // Read in a short transaction of its own: the provider is asked about them after it ended.
    const { account, underWay } = await this.context.withTenant(tenantId, async () => ({
      underWay: await this.accounts.paymentsUnderWay(),
      account: await this.accounts.find(),
    }))
    const stored = account && {
      credentials: account.credentials,
      givesWay: await this.givesWay(account, underWay, provider, credentials),
    }
    return { provider, credentials, answer, stored }
  }

  /**
   * Whether the stored account gives way to the new credentials while a payment is under way
   * (docs/ARCHITECTURE.md, Modules waiting for their domain owner): when they name the same
   * account, which goes on confirming the payment; when the stored ones no longer open; and when
   * the provider refuses them, so that nothing is confirmed with them again. A provider out of
   * reach refused nothing. The provider is asked only while a payment is under way.
   */
  private async givesWay(
    stored: StoredProviderAccount,
    underWay: boolean,
    provider: PaymentProvider,
    credentials: Credentials,
  ): Promise<boolean> {
    let opened: Credentials
    try {
      const sealedFor = { tenantId: this.context.tenant().id, provider: stored.provider }
      opened = this.vault.open(sealedFor, stored.credentials)
    } catch {
      return true
    }
    if (stored.provider === provider && this.providers.sameAccount(provider, opened, credentials)) {
      return true
    }
    if (!underWay) return false
    return (await this.providers.connect(stored.provider, opened)).outcome === 'refused'
  }
}
