import { type PaymentProvider } from '@opos/contract'

/** The credentials of a convention's account, as the fields its provider asks for. */
export type Credentials = Readonly<Record<string, string>>

/** What a provider says of credentials it was asked to check. */
export type CheckAnswer =
  | { outcome: 'accepted' }
  | { outcome: 'refused' }
  /** Out of reach; `reason` goes to the log alone. */
  | { outcome: 'unavailable'; reason: string }

/**
 * The port of a payment provider's module (docs/specs/0002-shop-setup.md, Provider port). Shop
 * setup uses what connects an account; checkout and orders adds the rest of the port.
 */
export interface PaymentProviderModule {
  readonly name: PaymentProvider
  /** Checks credentials with the provider: a call out, so never inside a transaction. */
  connect(credentials: Credentials): Promise<CheckAnswer>
  /**
   * The conditions of readiness that accepted credentials do not meet yet, read from them alone
   * with no call; none means the account is ready to sell.
   */
  missing(credentials: Credentials): string[]
}

/** The answer of connecting an account: what the provider said, and whether it is ready. */
export type ConnectAnswer =
  | { outcome: 'ready' }
  | { outcome: 'not-ready'; missing: string[] }
  | { outcome: 'refused' }
  | { outcome: 'unavailable'; reason: string }
  /** No module of that provider is loaded in this environment. */
  | { outcome: 'unknown-provider' }
