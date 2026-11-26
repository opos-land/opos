import {
  type AttemptOf,
  type CheckAnswer,
  type Credentials,
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
} from '../provider'
import { accountOf, type Przelewy24Account, providerDate, reasonOf, sameAccount } from './account'
import { Przelewy24Client } from './client'
import {
  cardFailureSignature,
  cardSuccessSignature,
  CHANNELS,
  notificationSignature,
  registrationSignature,
  signatureHolds,
  timeLimitMinutes,
  verificationSignature,
} from './signature'

/** The conditions of readiness a Przelewy24 account may still miss. */
export const MISSING = {
  /** The credentials stored do not name an account. */
  credentials: 'przelewy24.credentials-invalid',
  /** The org has not confirmed that Przelewy24's email finishing an abandoned payment is off. */
  abandonedPaymentEmail: 'przelewy24.abandoned-payment-email-on',
} as const

/** The languages Przelewy24's pages speak, of those the shop does. */
const LANGUAGES = new Set(['pl', 'en'])

/** The statuses of a transaction read by its session. */
const STATUS = { none: 0, advance: 1, made: 2, returned: 3 } as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

/** The `data` of an answer of the API, when it has one. */
const dataOf = (body: unknown) => (isRecord(body) && isRecord(body.data) ? body.data : undefined)

/**
 * Przelewy24 behind the port of a payment provider (docs/specs/0005-przelewy24.md): a convention
 * connects its own account, and its buyers pay by BLIK, bank transfer or card on Przelewy24's
 * page. The module holds nothing: a transaction is found by the attempt's identifier, which is its
 * `sessionId`. Nothing of a request or an answer is logged: they carry the buyer's email, and a
 * card notification the card's details, which are read to judge its signature and dropped.
 */
export class Przelewy24Provider implements PaymentProviderModule {
  readonly name = 'przelewy24'

  constructor(
    private readonly options: {
      /** Whether a sandbox account may be connected here: never on production. */
      sandboxAllowed: boolean
      client?: Przelewy24Client
      now?: () => Date
    },
    private readonly client = options.client ?? new Przelewy24Client(),
    private readonly now = options.now ?? (() => new Date()),
  ) {}

  /** The account of the credentials; they were checked when they were stored. */
  private account(credentials: Credentials): Przelewy24Account {
    const account = accountOf(credentials)
    if (!account) throw new Error('The credentials do not name a Przelewy24 account')
    return account
  }

  async connect(credentials: Credentials): Promise<CheckAnswer> {
    const account = accountOf(credentials)
    // Not an account, or a sandbox account where real money is taken: nothing is asked.
    if (!account || (account.sandbox && !this.options.sandboxAllowed)) return { outcome: 'refused' }
    const answer = await this.client.call(account, 'GET', '/api/v1/testAccess')
    if (answer.status === 200 && isRecord(answer.body) && answer.body.data === true) {
      return { outcome: 'accepted' }
    }
    // Also until the address the API calls from is entered in Przelewy24's panel.
    if (answer.status === 401 || answer.status === 403) return { outcome: 'refused' }
    return { outcome: 'unavailable', reason: `Przelewy24 answered ${answer.status}` }
  }

  missing(credentials: Credentials): string[] {
    const account = accountOf(credentials)
    if (!account) return [MISSING.credentials]
    return account.abandonedPaymentEmailOff ? [] : [MISSING.abandonedPaymentEmail]
  }

  sameAccount(one: Credentials, other: Credentials): boolean {
    return sameAccount(one, other)
  }

  /** The consent to Przelewy24's terms is asked on its own page: the shop shows none. */
  requirements(): ProviderRequirements {
    return { consent: null, maxEmailLength: 50 }
  }

  methods(): string[] {
    return ['blik', 'transfer', 'card']
  }

  async start(credentials: Credentials, request: StartRequest): Promise<StartAnswer> {
    const account = this.account(credentials)
    const answer = await this.client.call(account, 'POST', '/api/v1/transaction/register', {
      merchantId: account.merchantId,
      posId: account.posId,
      sessionId: request.id,
      amount: request.amountMinor,
      currency: request.currency,
      // The order's number, and nothing of the buyer.
      description: `Order ${request.reference}`,
      email: request.email,
      country: 'PL',
      language: LANGUAGES.has(request.locale) ? request.locale : 'en',
      urlReturn: request.returnUrl,
      urlStatus: request.notificationUrl,
      // What is left of the order's hold: a payment after it is not what the order holds for.
      timeLimit: timeLimitMinutes(request.payableUntil, this.now()),
      channel: CHANNELS,
      // The buyer stays at the provider until the result is known.
      waitForResult: true,
      // The consent to the provider's terms is asked on the provider's page.
      regulationAccept: false,
      transferLabel: request.reference,
      urlCardPaymentNotification: request.additionalNotificationUrl,
      sign: registrationSignature(
        {
          sessionId: request.id,
          merchantId: account.merchantId,
          amount: request.amountMinor,
          currency: request.currency,
        },
        account.crc,
      ),
    })
    const token = dataOf(answer.body)?.token
    // An answer that the request is at fault, such as a merchant or a signature that does not
    // match: no transaction was registered. Any other answer does not say whether one was.
    if (answer.status >= 400 && answer.status < 500) {
      return { outcome: 'refused', reason: `Przelewy24 answered ${answer.status}` }
    }
    if (answer.status !== 200 || typeof token !== 'string' || token === '') {
      return { outcome: 'unavailable', reason: `Przelewy24 answered ${answer.status}` }
    }
    return {
      outcome: 'started',
      redirectUrl: `${this.client.base(account)}/trnRequest/${encodeURIComponent(token)}`,
    }
  }

  read(
    credentials: Credentials,
    attempt: AttemptOf,
    body: unknown,
    additional: boolean,
  ): Notification | undefined {
    const account = accountOf(credentials)
    if (!account || !isRecord(body)) return undefined
    return additional
      ? this.readAdditional(account, attempt, body)
      : this.readPayment(account, attempt, body)
  }

  /** The notification of a payment made: the only word of Przelewy24 that pays an order. */
  private readPayment(
    account: Przelewy24Account,
    attempt: AttemptOf,
    body: Record<string, unknown>,
  ): Notification | undefined {
    const { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId } = body
    const { statement, sign } = body
    if (
      !isWhole(merchantId) ||
      !isWhole(posId) ||
      typeof sessionId !== 'string' ||
      !isWhole(amount) ||
      !isWhole(originAmount) ||
      typeof currency !== 'string' ||
      !isWhole(orderId) ||
      !isWhole(methodId) ||
      typeof statement !== 'string'
    ) {
      return undefined
    }
    const expected = notificationSignature(
      {
        merchantId,
        posId,
        sessionId,
        amount,
        originAmount,
        currency,
        orderId,
        methodId,
        statement,
      },
      account.crc,
    )
    if (!signatureHolds(sign, expected)) return undefined
    // Signed by this account, and yet of another attempt, account or registration: not this one.
    if (
      sessionId !== attempt.id ||
      merchantId !== account.merchantId ||
      posId !== account.posId ||
      currency !== attempt.currency ||
      originAmount !== attempt.amountMinor
    ) {
      return undefined
    }
    return {
      kind: 'payment',
      payment: {
        paidAmountMinor: amount,
        // The notification carries no date: the payment counts as made when it is reported.
        paidAt: this.now(),
        providerReference: String(orderId),
      },
    }
  }

  /**
   * An additional notification. A card refused fails the attempt, with the provider's code and
   * message for the orgs. A card payment that went through changes nothing: the notification of
   * the payment itself confirms it. The additional notification of BLIK is not read: the
   * documentation gives neither the fields of its result nor how it is signed, and nothing counts
   * before its signature holds.
   */
  private readAdditional(
    account: Przelewy24Account,
    attempt: AttemptOf,
    body: Record<string, unknown>,
  ): Notification | undefined {
    const { amount, method, orderId, sessionId, sign } = body
    const secure = body['3ds']
    if (
      !isWhole(amount) ||
      typeof secure !== 'boolean' ||
      !isWhole(method) ||
      !isWhole(orderId) ||
      typeof sessionId !== 'string'
    ) {
      return undefined
    }
    const common = { amount, '3ds': secure, method, orderId, sessionId }
    const { errorCode, errorMessage } = body
    if (typeof errorCode === 'string' && typeof errorMessage === 'string') {
      const expected = cardFailureSignature({ ...common, errorCode, errorMessage }, account.crc)
      if (!signatureHolds(sign, expected) || sessionId !== attempt.id) return undefined
      return {
        kind: 'failure',
        reason: reasonOf(errorCode),
        code: errorCode,
        message: errorMessage,
      }
    }
    const { refId, bin, maskedCCNumber, ccExp, hash, cardCountry, risk, liabilityshift } = body
    if (
      typeof refId !== 'string' ||
      !isWhole(bin) ||
      typeof maskedCCNumber !== 'string' ||
      typeof ccExp !== 'string' ||
      typeof hash !== 'string' ||
      typeof cardCountry !== 'string' ||
      !isWhole(risk) ||
      typeof liabilityshift !== 'boolean'
    ) {
      return undefined
    }
    const expected = cardSuccessSignature(
      { ...common, refId, bin, maskedCCNumber, ccExp, hash, cardCountry, risk, liabilityshift },
      account.crc,
    )
    if (!signatureHolds(sign, expected) || sessionId !== attempt.id) return undefined
    // The card's details end here: nothing of them is answered, stored or logged.
    return { kind: 'nothing' }
  }

  /**
   * Verifies the transaction: only then is the money the convention's. The amount verified is the
   * one the provider reported as paid.
   */
  async settle(
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<SettleAnswer> {
    const account = this.account(credentials)
    const orderId = Number(payment.providerReference)
    if (!Number.isSafeInteger(orderId)) {
      return { outcome: 'unavailable', reason: 'the payment names no transaction of Przelewy24' }
    }
    const answer = await this.client.call(account, 'PUT', '/api/v1/transaction/verify', {
      merchantId: account.merchantId,
      posId: account.posId,
      sessionId: attempt.id,
      amount: payment.paidAmountMinor,
      currency: attempt.currency,
      orderId,
      sign: verificationSignature(
        {
          sessionId: attempt.id,
          orderId,
          amount: payment.paidAmountMinor,
          currency: attempt.currency,
        },
        account.crc,
      ),
    })
    if (answer.status === 200 && dataOf(answer.body)?.status === 'success') {
      return { outcome: 'settled' }
    }
    return { outcome: 'unavailable', reason: `Przelewy24 answered ${answer.status}` }
  }

  /**
   * A payment its order no longer needs is refused by not verifying it: nothing is asked of the
   * provider, and the money stays at the buyer's disposal there.
   */
  refuse(): Promise<RefuseAnswer> {
    return Promise.resolve({ refused: true })
  }

  async state(credentials: Credentials, attempt: AttemptOf): Promise<StateAnswer> {
    const account = this.account(credentials)
    const answer = await this.client.call(
      account,
      'GET',
      `/api/v1/transaction/by/sessionId/${encodeURIComponent(attempt.id)}`,
    )
    // A transaction never registered, as one whose registration did not answer.
    if (answer.status === 404) return { state: 'not-paid' }
    const data = dataOf(answer.body)
    if (answer.status !== 200 || !data || !isWhole(data.status)) {
      return { state: 'unavailable', reason: `Przelewy24 answered ${answer.status}` }
    }
    if (data.status === STATUS.none || data.status === STATUS.returned) return { state: 'not-paid' }
    if (
      (data.status !== STATUS.advance && data.status !== STATUS.made) ||
      !isWhole(data.amount) ||
      !isWhole(data.orderId)
    ) {
      return {
        state: 'unavailable',
        reason: 'Przelewy24 answered a state the module does not know',
      }
    }
    return {
      state: 'paid',
      payment: {
        paidAmountMinor: data.amount,
        // A payment made, verified or not, counts as made at the provider's own date of it.
        paidAt: providerDate(data.dateOfTransaction) ?? providerDate(data.date) ?? this.now(),
        providerReference: String(data.orderId),
      },
    }
  }

  moneyWith(where: MoneyWith): Sentence {
    return where === 'convention'
      ? {
          en: 'The payment was taken through Przelewy24, and the money is with the convention.',
          pl: 'Płatność została przyjęta przez Przelewy24, a pieniądze są u konwentu.',
        }
      : {
          en: 'The payment was not taken: the money stays at your disposal at Przelewy24. Przelewy24 returns it after 30 days, less its own fee for the return, or at once when you ask Przelewy24.',
          pl: 'Płatność nie została przyjęta: pieniądze pozostają do twojej dyspozycji w Przelewy24. Przelewy24 zwróci je po 30 dniach, pomniejszone o własną opłatę za zwrot, albo od razu, gdy o to poprosisz Przelewy24.',
        }
  }

  /**
   * What an attempt keeps for the orgs: the provider's number of the transaction, by which the
   * payment is found in Przelewy24's panel, and the payout batch and the commission once the
   * provider gives them.
   */
  async information(
    credentials: Credentials,
    attempt: AttemptOf,
    payment: ReportedPayment,
  ): Promise<Record<string, string>> {
    const information: Record<string, string> = {}
    if (payment.providerReference !== null) information.transaction = payment.providerReference
    const account = this.account(credentials)
    const answer = await this.client
      .call(account, 'GET', `/api/v1/transaction/by/sessionId/${encodeURIComponent(attempt.id)}`)
      .catch(() => undefined)
    const data = answer?.status === 200 ? dataOf(answer.body) : undefined
    if (data && isWhole(data.batchId) && data.batchId > 0) information.batch = String(data.batchId)
    if (data && typeof data.fee === 'string' && /^\d+$/.test(data.fee) && Number(data.fee) > 0) {
      information.commissionMinor = data.fee
    }
    return information
  }
}
