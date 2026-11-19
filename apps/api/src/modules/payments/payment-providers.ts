import { Inject, Injectable } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { open, providerAccountOf, seal, sealingKey } from '@opos/db/sealed'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ENV, type Env } from '../../config/env'
import { FakeProvider } from './fake-provider'
import { type ConnectAnswer, type Credentials, type PaymentProviderModule } from './provider'

export const PROVIDER_MODULES = Symbol('PROVIDER_MODULES')

/**
 * The provider modules this environment loads, by name. Only local and dev load the fake provider
 * (docs/ARCHITECTURE.md, Modules waiting for their domain owner): on production no credentials
 * connect an account that takes no money.
 */
export function providerModules(
  env: Pick<Env, 'OPOS_ENV'>,
): ReadonlyMap<PaymentProvider, PaymentProviderModule> {
  const modules: PaymentProviderModule[] = env.OPOS_ENV === 'production' ? [] : [new FakeProvider()]
  return new Map(modules.map((module) => [module.name, module]))
}

/** The payment providers of this environment, as the shop asks them. */
@Injectable()
export class PaymentProviders {
  constructor(
    @Inject(PROVIDER_MODULES)
    private readonly modules: ReadonlyMap<PaymentProvider, PaymentProviderModule>,
  ) {}

  /** The providers this environment has a module of. */
  names(): PaymentProvider[] {
    return [...this.modules.keys()]
  }

  /** Whether a module of the provider is loaded here. */
  loaded(provider: PaymentProvider) {
    return this.modules.has(provider)
  }

  /**
   * Checks the credentials with their provider and says whether the account is ready to sell: a
   * call out, refused inside a transaction.
   */
  async connect(provider: PaymentProvider, credentials: Credentials): Promise<ConnectAnswer> {
    const store = TenantContextService.peek()
    if (store?.tx || store?.accountTx) {
      throw new Error('A payment provider is called outside every transaction')
    }
    const module = this.modules.get(provider)
    if (!module) return { outcome: 'unknown-provider' }
    let answer: Awaited<ReturnType<PaymentProviderModule['connect']>>
    try {
      answer = await module.connect(credentials)
    } catch (error) {
      // A module that fails outright is a provider out of reach. Its error may quote the request
      // it sent, so only its name goes on: no log line holds the credentials.
      const name = error instanceof Error ? error.name : 'a value that is no error'
      return { outcome: 'unavailable', reason: `the provider's module threw ${name}` }
    }
    if (answer.outcome !== 'accepted') return answer
    const missing = module.missing(credentials)
    return missing.length === 0 ? { outcome: 'ready' } : { outcome: 'not-ready', missing }
  }

  /**
   * What the provider's module requires of the shop's pages and the methods it lists, with no
   * call; undefined where no module of the provider is loaded.
   */
  pages(provider: PaymentProvider) {
    const module = this.modules.get(provider)
    return module && { requirements: module.requirements(), methods: module.methods() }
  }

  /**
   * The conditions of readiness stored credentials still miss, with no call; an account whose
   * provider has no module here cannot sell, and says so.
   */
  missing(provider: PaymentProvider, credentials: Credentials): string[] {
    return this.modules.get(provider)?.missing(credentials) ?? ['provider.not-loaded']
  }
}

/** The account credentials are sealed for: a tenant's, with one provider. */
export interface SealedFor {
  tenantId: string
  provider: PaymentProvider
}

/**
 * Seals a provider account's credentials with the key the API alone holds, and opens them to call
 * the provider. Sealed, they are the only form the database and a backup ever hold; they are
 * sealed for their tenant and provider, so a value moved to another account opens nothing.
 */
@Injectable()
export class CredentialsVault {
  private readonly key: Buffer

  constructor(@Inject(ENV) env: Pick<Env, 'PAYMENT_CREDENTIALS_KEY'>) {
    this.key = sealingKey(env.PAYMENT_CREDENTIALS_KEY)
  }

  seal(account: SealedFor, credentials: Credentials): string {
    return seal(
      this.key,
      JSON.stringify(credentials),
      providerAccountOf(account.tenantId, account.provider),
    )
  }

  open(account: SealedFor, sealed: string): Credentials {
    return JSON.parse(
      open(this.key, sealed, providerAccountOf(account.tenantId, account.provider)),
    ) as Credentials
  }
}
