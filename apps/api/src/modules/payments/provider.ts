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

/** Why an attempt failed, as a buyer reads it: one of the shop's own short list. */
export type FailureReason =
  'declined' | 'insufficient-funds' | 'wrong-code' | 'timed-out' | 'canceled' | 'failed'

/** A payment attempt, as the shop names it to the module. */
export interface AttemptOf {
  id: string
  /** What the order asks for, in minor units. */
  amountMinor: number
  currency: string
  /** The order's number: the reference of the payment at the provider. */
  reference: string
}

/** What starting an attempt carries (docs/specs/0004-checkout-and-orders.md, Y2). */
export interface StartRequest extends AttemptOf {
  /** What the buyer reads at the provider, with no personal data. */
  description: string
  /** The buyer's address, which a provider asks for. */
  email: string
  /** The language of the provider's pages, where it has it. */
  locale: string
  /** Where the buyer returns to. */
  returnUrl: string
  /** Until when the order may be paid: the end of its hold, for a provider that limits the time. */
  payableUntil: Date
  /** Where the provider reports a payment made, and what else it reports of the attempt. */
  notificationUrl: string
  additionalNotificationUrl: string
}

export type StartAnswer =
  | { outcome: 'started'; redirectUrl: string }
  /**
   * The provider answered, and registered nothing: it knows no such attempt and will never
   * confirm a payment of it. `reason` goes to the log alone.
   */
  | { outcome: 'refused'; reason: string }
  /**
   * Out of reach, or an answer that does not say: the provider may know the attempt after all.
   * `reason` goes to the log alone.
   */
  | { outcome: 'unavailable'; reason: string }

/** A payment a provider reports of an attempt. */
export interface ReportedPayment {
  /** What was paid, which may differ from what the order asked for. */
  paidAmountMinor: number
  /** When the payment was made, by the provider's own clock. */
  paidAt: Date
  /** The provider's own number of the transaction. */
  providerReference: string | null
}

/** What a notification says, once its signature held. */
export type Notification =
  | { kind: 'payment'; payment: ReportedPayment }
  | { kind: 'failure'; reason: FailureReason; code: string | null; message: string | null }
  /**
   * Signed, and of the attempt, but nothing the shop acts on: such as an additional word of a
   * card payment that went through, which the notification of the payment itself confirms.
   */
  | { kind: 'nothing' }

export type SettleAnswer = { outcome: 'settled' } | { outcome: 'unavailable'; reason: string }

/** Whether the provider could refuse a payment: refused, its money is with the buyer. */
export interface RefuseAnswer {
  refused: boolean
}

export type StateAnswer =
  | { state: 'paid'; payment: ReportedPayment }
  | { state: 'not-paid' }
  | { state: 'unavailable'; reason: string }

/** Where the money of a payment is. */
export type MoneyWith = 'convention' | 'buyer'

/**
 * The port of a payment provider's module (docs/specs/0004-checkout-and-orders.md, Provider
 * port). Shop setup uses what connects an account; the shop's pages what the module requires of
 * them and the methods it lists; checkout the rest. A method that calls the provider answers a
 * promise and never runs inside a transaction.
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
  /**
   * Whether two sets of credentials name one account at the provider, read from them alone with
   * no call: a payment started with the one is found and confirmed with the other, once it is
   * right. Credentials that name no account are the same as none.
   */
  sameAccount(one: Credentials, other: Credentials): boolean
  /** What it requires of the shop's pages, with no call. */
  requirements(): ProviderRequirements
  /** The payment methods the shop names: a fixed list a provider. */
  methods(): string[]
  /** Starts a payment attempt and answers where to send the buyer. */
  start(credentials: Credentials, request: StartRequest): Promise<StartAnswer>
  /**
   * Reads a notification of the provider about the attempt, with no call: a payment made, or a
   * failure and its reason on the address of the additional ones. Undefined when its signature
   * does not hold or it is not about the attempt: such a notification changes nothing.
   */
  read(
    credentials: Credentials,
    attempt: AttemptOf,
    body: unknown,
    additional: boolean,
  ): Notification | undefined
  /** Finishes the provider's process for a payment the order takes; a repeat changes nothing. */
  settle(
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<SettleAnswer>
  /** Refuses a payment its order no longer needs, and says whether the provider could. */
  refuse(
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<RefuseAnswer>
  /** The state of an attempt at the provider: paid, with the amount and the time, or not. */
  state(credentials: Credentials, attempt: AttemptOf): Promise<StateAnswer>
  /** Where the money of a payment is, as the sentence shown to the buyer; no call. */
  moneyWith(where: MoneyWith): Sentence
  /** What an attempt keeps of a payment for the orgs, such as the transaction's number. */
  information(
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<Record<string, string>>
}

/** The answer of connecting an account: what the provider said, and whether it is ready. */
export type ConnectAnswer =
  | { outcome: 'ready' }
  | { outcome: 'not-ready'; missing: string[] }
  | { outcome: 'refused' }
  | { outcome: 'unavailable'; reason: string }
  /** No module of that provider is loaded in this environment. */
  | { outcome: 'unknown-provider' }
