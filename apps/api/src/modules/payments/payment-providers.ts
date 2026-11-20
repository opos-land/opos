import { Inject, Injectable } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { open, providerAccountOf, seal, sealingKey } from '@opos/db/sealed'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ENV, type Env } from '../../config/env'
import { FakeProvider } from './fake-provider'
import { PRZELEWY24_ADDRESSES, Przelewy24Client } from './przelewy24/client'
import { Przelewy24Provider } from './przelewy24/przelewy24-provider'
import {
  type AttemptOf,
  type CheckAnswer,
  type ConnectAnswer,
  type Credentials,
  type MoneyWith,
  type Notification,
  type PaymentProviderModule,
  type RefuseAnswer,
  type ReportedPayment,
  type Sentence,
  type SettleAnswer,
  type StartAnswer,
  type StartRequest,
  type StateAnswer,
} from './provider'

export const PROVIDER_MODULES = Symbol('PROVIDER_MODULES')

/**
 * The provider modules this environment loads, by name. Przelewy24 is loaded everywhere, and
 * connects a sandbox account only where no real money is taken. Only local and dev load the fake
 * provider (docs/ARCHITECTURE.md, Modules waiting for their domain owner): on production no
 * credentials connect an account that takes no money.
 */
export function providerModules(
  env: Pick<Env, 'OPOS_ENV' | 'API_URL'> &
    Partial<Pick<Env, 'PRZELEWY24_URL' | 'PRZELEWY24_SANDBOX_URL'>>,
): ReadonlyMap<PaymentProvider, PaymentProviderModule> {
  const production = env.OPOS_ENV === 'production'
  const przelewy24 = new Przelewy24Provider({
    sandboxAllowed: !production,
    client: new Przelewy24Client({
      production: env.PRZELEWY24_URL ?? PRZELEWY24_ADDRESSES.production,
      sandbox: env.PRZELEWY24_SANDBOX_URL ?? PRZELEWY24_ADDRESSES.sandbox,
    }),
  })
  const modules: PaymentProviderModule[] = production
    ? [przelewy24]
    : [new FakeProvider(env.API_URL.replace(/\/$/, '')), przelewy24]
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

  /** A provider is asked outside every transaction: outbound I/O never runs in one. */
  private outside() {
    const store = TenantContextService.peek()
    if (store?.tx || store?.accountTx) {
      throw new Error('A payment provider is called outside every transaction')
    }
  }

  /**
   * Asks the provider's module, outside every transaction. A provider with no module here, and a
   * module that fails outright, are a provider out of reach, which `unavailable` answers. A
   * module's error may quote the request it sent, so only its name goes on: no log line holds
   * the credentials.
   */
  private async ask<T>(
    provider: PaymentProvider,
    call: (module: PaymentProviderModule) => Promise<T>,
    unavailable: (reason: string) => T,
  ): Promise<T> {
    this.outside()
    const module = this.modules.get(provider)
    if (!module) return unavailable('no module of the provider is loaded in this environment')
    try {
      return await call(module)
    } catch (error) {
      const name = error instanceof Error ? error.name : 'a value that is no error'
      return unavailable(`the provider's module threw ${name}`)
    }
  }

  /**
   * Checks the credentials with their provider and says whether the account is ready to sell: a
   * call out, refused inside a transaction.
   */
  async connect(provider: PaymentProvider, credentials: Credentials): Promise<ConnectAnswer> {
    this.outside()
    const module = this.modules.get(provider)
    if (!module) return { outcome: 'unknown-provider' }
    const answer = await this.ask<CheckAnswer>(
      provider,
      (asked) => asked.connect(credentials),
      (reason) => ({ outcome: 'unavailable', reason }),
    )
    if (answer.outcome !== 'accepted') return answer
    const missing = module.missing(credentials)
    return missing.length === 0 ? { outcome: 'ready' } : { outcome: 'not-ready', missing }
  }

  /** Starts a payment attempt at the provider and answers where to send the buyer. */
  start(
    provider: PaymentProvider,
    credentials: Credentials,
    request: StartRequest,
  ): Promise<StartAnswer> {
    return this.ask<StartAnswer>(
      provider,
      (module) => module.start(credentials, request),
      (reason) => ({ outcome: 'unavailable', reason }),
    )
  }

  /**
   * Reads a notification about the attempt, with no call; undefined when its signature does not
   * hold, or no module of the provider is loaded here.
   */
  read(
    provider: PaymentProvider,
    credentials: Credentials,
    attempt: AttemptOf,
    body: unknown,
    additional: boolean,
  ): Notification | undefined {
    return this.modules.get(provider)?.read(credentials, attempt, body, additional)
  }

  /** Finishes the provider's process for a payment the order takes. */
  settle(
    provider: PaymentProvider,
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<SettleAnswer> {
    return this.ask<SettleAnswer>(
      provider,
      (module) => module.settle(credentials, attempt, payment),
      (reason) => ({ outcome: 'unavailable', reason }),
    )
  }

  /**
   * Refuses a payment its order no longer needs. A provider that did not answer did not refuse
   * it: its money counts as the convention's until someone finds otherwise.
   */
  refuse(
    provider: PaymentProvider,
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<RefuseAnswer> {
    return this.ask<RefuseAnswer>(
      provider,
      (module) => module.refuse(credentials, attempt, payment),
      () => ({ refused: false }),
    )
  }

  /** The state of an attempt at the provider. */
  state(
    provider: PaymentProvider,
    credentials: Credentials,
    attempt: AttemptOf,
  ): Promise<StateAnswer> {
    return this.ask<StateAnswer>(
      provider,
      (module) => module.state(credentials, attempt),
      (reason) => ({ state: 'unavailable', reason }),
    )
  }

  /** Where the money of a payment is, as the provider's module words it; no call. */
  moneyWith(provider: PaymentProvider, where: MoneyWith): Sentence | undefined {
    return this.modules.get(provider)?.moneyWith(where)
  }

  /** What an attempt keeps of a payment for the orgs; nothing when the provider gave none. */
  information(
    provider: PaymentProvider,
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<Record<string, string>> {
    return this.ask<Record<string, string>>(
      provider,
      (module) => module.information(credentials, attempt, payment),
      () => ({}),
    )
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
