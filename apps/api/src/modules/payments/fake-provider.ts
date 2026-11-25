import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  type AttemptOf,
  type CheckAnswer,
  type Credentials,
  type FailureReason,
  type MoneyWith,
  type Notification,
  type PaymentProviderModule,
  type ProviderRequirements,
  type RefuseAnswer,
  type ReportedPayment,
  type Sentence,
  type SettleAnswer,
  type StartAnswer,
  type StartRequest,
  type StateAnswer,
} from './provider'

/**
 * The accounts the fake provider answers in a way of their own, by the `account` of the
 * credentials: one it refuses, one it accepts as not ready, and one it is out of reach for.
 */
export const FAKE_ACCOUNT = {
  refused: 'refused',
  notReady: 'not-ready',
  unavailable: 'unavailable',
  /** Starting an attempt finds the provider out of reach. */
  startUnavailable: 'start-unavailable',
  /** Starting an attempt is refused: the provider answers, and knows no such attempt. */
  startRefused: 'start-refused',
  /** Asking for the state of an attempt does not answer. */
  stateUnavailable: 'state-unavailable',
  /** Settling a payment does not answer. */
  settleUnavailable: 'settle-unavailable',
  /** A payment its order no longer needs cannot be refused: its money stays with the convention. */
  cannotRefuse: 'cannot-refuse',
} as const

/** The fake provider's own codes of a failure, by what the shop reads them as. */
const FAILURES: Readonly<Record<string, FailureReason>> = {
  'card-declined': 'declined',
  'no-funds': 'insufficient-funds',
  'wrong-code': 'wrong-code',
  'timed-out': 'timed-out',
  canceled: 'canceled',
}

/** What the fake provider sends the shop of an attempt, signed with the account's own secret. */
export interface FakeNotification {
  attemptId: string
  event: 'paid' | 'failed'
  /** Of a payment: what was paid, when, and the fake's number of the transaction. */
  amountMinor?: number
  paidAt?: string
  transaction?: string
  /** Of a failure: the fake's own code. */
  code?: string
  signature: string
}

const signed = (credentials: Credentials, fields: Omit<FakeNotification, 'signature'>) =>
  createHmac('sha256', `fake:${credentials.account ?? ''}`)
    .update(
      [
        fields.attemptId,
        fields.event,
        fields.amountMinor ?? '',
        fields.paidAt ?? '',
        fields.transaction ?? '',
        fields.code ?? '',
      ].join('|'),
    )
    .digest('hex')

/** A notification of the fake provider about an attempt, as an account of it signs it. */
export const fakeNotification = (
  credentials: Credentials,
  fields: Omit<FakeNotification, 'signature'>,
): FakeNotification => ({ ...fields, signature: signed(credentials, fields) })

/** What the fake provider remembers of an attempt it started. */
interface FakeAttempt {
  request: StartRequest
  credentials: Credentials
  payment?: ReportedPayment
}

/**
 * The fake payment provider, loaded on local and dev alone (docs/ARCHITECTURE.md, Environments).
 * It accepts any credentials but the accounts above, so that every answer of a real provider has
 * a test and a demo convention can connect an account. It takes no money: a payment is a press
 * of a button on its pay page. What it started and what was paid it remembers in this process
 * alone, as a real provider does on its own servers.
 */
export class FakeProvider implements PaymentProviderModule {
  readonly name = 'fake'
  private readonly attempts = new Map<string, FakeAttempt>()

  /** `apiUrl` is where its pay page is served: this API's own address. */
  constructor(private readonly apiUrl = 'http://localhost') {}

  connect(credentials: Credentials): Promise<CheckAnswer> {
    if (credentials.account === FAKE_ACCOUNT.refused) return Promise.resolve({ outcome: 'refused' })
    if (credentials.account === FAKE_ACCOUNT.unavailable) {
      return Promise.resolve({ outcome: 'unavailable', reason: 'the fake provider is asked to be' })
    }
    return Promise.resolve({ outcome: 'accepted' })
  }

  missing(credentials: Credentials): string[] {
    return credentials.account === FAKE_ACCOUNT.notReady ? ['fake.not-ready'] : []
  }

  /** Its `account` is the account: whatever else the credentials carry may change. */
  sameAccount(one: Credentials, other: Credentials): boolean {
    return one.account !== undefined && one.account === other.account
  }

  /**
   * A consent of its own that "Select all required" may not tick, and an email no longer than a
   * real provider takes: what the shop's pages do with either has a test and a demo.
   */
  requirements(): ProviderRequirements {
    return {
      consent: {
        text: {
          en: 'I accept the terms of the fake payment provider, which takes no money.',
          pl: 'Akceptuję regulamin testowego dostawcy płatności, który nie pobiera pieniędzy.',
        },
        links: [
          {
            label: { en: 'Terms of the fake payment provider', pl: 'Regulamin testowego dostawcy' },
            url: 'https://example.com/fake-provider/terms',
          },
        ],
        selectAllAllowed: false,
      },
      maxEmailLength: 50,
    }
  }

  methods(): string[] {
    return ['blik', 'transfer', 'card']
  }

  start(credentials: Credentials, request: StartRequest): Promise<StartAnswer> {
    if (credentials.account === FAKE_ACCOUNT.startUnavailable) {
      return Promise.resolve({ outcome: 'unavailable', reason: 'the fake provider is asked to be' })
    }
    if (credentials.account === FAKE_ACCOUNT.startRefused) {
      return Promise.resolve({ outcome: 'refused', reason: 'the fake provider is asked to refuse' })
    }
    this.attempts.set(request.id, { request, credentials })
    return Promise.resolve({
      outcome: 'started',
      redirectUrl: `${this.apiUrl}/payments/fake/pay/${request.id}`,
    })
  }

  /** What the pay page shows of an attempt this provider started, or undefined. */
  started(attemptId: string): StartRequest | undefined {
    return this.attempts.get(attemptId)?.request
  }

  /**
   * The buyer pays at the fake provider: the payment is remembered, and the notification the
   * provider sends of it is answered. `amountMinor` is for a provider that reports another
   * amount than the one it was asked for.
   */
  pay(
    attemptId: string,
    { amountMinor, at = new Date() }: { amountMinor?: number; at?: Date } = {},
  ) {
    const attempt = this.known(attemptId)
    attempt.payment = {
      paidAmountMinor: amountMinor ?? attempt.request.amountMinor,
      paidAt: at,
      providerReference: attempt.payment?.providerReference ?? `FAKE-${randomUUID()}`,
    }
    return fakeNotification(attempt.credentials, {
      attemptId,
      event: 'paid',
      amountMinor: attempt.payment.paidAmountMinor,
      paidAt: at.toISOString(),
      transaction: attempt.payment.providerReference!,
    })
  }

  /** The payment fails at the fake provider, with one of its own codes: the notification of it. */
  fail(attemptId: string, code: string) {
    const attempt = this.known(attemptId)
    return fakeNotification(attempt.credentials, { attemptId, event: 'failed', code })
  }

  private known(attemptId: string): FakeAttempt {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new Error(`The fake provider started no attempt ${attemptId}`)
    return attempt
  }

  read(
    credentials: Credentials,
    attempt: AttemptOf,
    body: unknown,
    additional: boolean,
  ): Notification | undefined {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
    const { signature, ...fields } = body as Partial<FakeNotification>
    if (typeof signature !== 'string' || typeof fields.attemptId !== 'string') return undefined
    if (fields.event !== 'paid' && fields.event !== 'failed') return undefined
    const expected = Buffer.from(signed(credentials, fields as Omit<FakeNotification, 'signature'>))
    const given = Buffer.from(signature)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
    if (fields.attemptId !== attempt.id) return undefined
    // A payment comes on the notifications' own address, a failure on the additional one.
    if ((fields.event === 'failed') !== additional) return undefined
    if (fields.event === 'failed') {
      const code = fields.code ?? null
      return {
        kind: 'failure',
        reason: (code !== null && FAILURES[code]) || 'failed',
        code,
        message: `The fake provider reports ${code ?? 'a failure'}`,
      }
    }
    const paidAt = new Date(fields.paidAt ?? '')
    if (!Number.isInteger(fields.amountMinor) || Number.isNaN(paidAt.getTime())) return undefined
    return {
      kind: 'payment',
      payment: {
        paidAmountMinor: fields.amountMinor!,
        paidAt,
        providerReference: fields.transaction ?? null,
      },
    }
  }

  settle(
    credentials: Credentials,
    _attempt: AttemptOf,
    _payment: ReportedPayment,
  ): Promise<SettleAnswer> {
    if (credentials.account === FAKE_ACCOUNT.settleUnavailable) {
      return Promise.resolve({ outcome: 'unavailable', reason: 'the fake provider is asked to be' })
    }
    return Promise.resolve({ outcome: 'settled' })
  }

  refuse(
    credentials: Credentials,
    attempt: AttemptOf,
    _payment: ReportedPayment,
  ): Promise<RefuseAnswer> {
    if (credentials.account === FAKE_ACCOUNT.cannotRefuse) {
      return Promise.resolve({ refused: false })
    }
    // Refused, the payment is the buyer's again: the provider no longer counts it as made.
    const known = this.attempts.get(attempt.id)
    if (known) delete known.payment
    return Promise.resolve({ refused: true })
  }

  state(credentials: Credentials, attempt: AttemptOf): Promise<StateAnswer> {
    if (credentials.account === FAKE_ACCOUNT.stateUnavailable) {
      return Promise.resolve({ state: 'unavailable', reason: 'the fake provider is asked to be' })
    }
    const payment = this.attempts.get(attempt.id)?.payment
    return Promise.resolve(payment ? { state: 'paid', payment } : { state: 'not-paid' })
  }

  moneyWith(where: MoneyWith): Sentence {
    return where === 'convention'
      ? {
          en: 'The fake payment provider handed the payment over to the convention. It took no real money.',
          pl: 'Testowy dostawca płatności przekazał płatność konwentowi. Nie pobrał prawdziwych pieniędzy.',
        }
      : {
          en: 'The fake payment provider did not take the payment. It took no real money.',
          pl: 'Testowy dostawca płatności nie przyjął płatności. Nie pobrał prawdziwych pieniędzy.',
        }
  }

  information(
    _credentials: Credentials,
    _attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<Record<string, string>> {
    const information: Record<string, string> = {}
    if (payment.providerReference !== null) information.transaction = payment.providerReference
    return Promise.resolve(information)
  }
}
