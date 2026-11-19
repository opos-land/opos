import { type PaymentProvider } from '@opos/contract'

/** The credentials of a convention's account, as the fields its provider asks for. */
export type Credentials = Readonly<Record<string, string>>

/** What a provider says of credentials it was asked to check. */
export type CheckAnswer =
  | { outcome: 'accepted' }
  | { outcome: 'refused' }
  /** Out of reach; `reason` goes to the log alone. */
  | { outcome: 'unavailable'; reason: string }

/** A sentence a provider's module gives, in each language it has it in, by locale. */
export type Sentence = Readonly<Record<string, string>>

/** What a provider's module requires of the shop's pages. */
export interface ProviderRequirements {
  /**
   * Its own consent, when it requires one: the wording, the documents it links, and whether the
   * shop's "Select all required" may tick it.
   */
  consent: {
    text: Sentence
    links: { label: Sentence; url: string }[]
    selectAllAllowed: boolean
  } | null
  /** The longest email it takes. */
  maxEmailLength: number
}

/**
 * The port of a payment provider's module (docs/specs/0004-checkout-and-orders.md, Provider
 * port). Shop setup uses what connects an account; the shop's pages what the module requires of
 * them and the methods it lists.
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
  /** What it requires of the shop's pages, with no call. */
  requirements(): ProviderRequirements
  /** The payment methods the shop names: a fixed list a provider. */
  methods(): string[]
}

/** The answer of connecting an account: what the provider said, and whether it is ready. */
export type ConnectAnswer =
  | { outcome: 'ready' }
  | { outcome: 'not-ready'; missing: string[] }
  | { outcome: 'refused' }
  | { outcome: 'unavailable'; reason: string }
  /** No module of that provider is loaded in this environment. */
  | { outcome: 'unknown-provider' }
