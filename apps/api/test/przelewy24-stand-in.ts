import { createServer, type IncomingMessage, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import {
  cardFailureSignature,
  cardSuccessSignature,
  notificationSignature,
  registrationSignature,
  signatureHolds,
  verificationSignature,
} from '../src/modules/payments/przelewy24/signature'

// A stand-in for Przelewy24's REST API that answers as its documentation says (version 1.0.18):
// the access test, the registration of a transaction, its verification and its state by session.
// What a buyer does at the provider, a test does here, and gets the notification Przelewy24
// would send, signed with the account's CRC key.

export interface StandInAccount {
  merchantId: number
  posId: number
  apiKey: string
  crc: string
}

/** The statuses of a transaction: no payment, an advance payment, a payment made, one returned. */
type Status = 0 | 1 | 2 | 3

interface Transaction {
  account: StandInAccount
  token: string
  /** The body it was registered with. */
  registered: Record<string, unknown>
  status: Status
  orderId: number
  /** What was paid, which may differ from what was registered. */
  paid?: number
  date?: string
}

export interface Received {
  method: string
  path: string
  body: Record<string, unknown> | undefined
}

const read = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export class Przelewy24StandIn {
  /** Every request it took, in order: what the module sent Przelewy24. */
  readonly received: Received[] = []
  /** While true no call answers well: the provider is out of reach. */
  down = false
  /** While true a verification does not answer well, and everything else does. */
  verificationDown = false
  private readonly accounts: StandInAccount[] = []
  private readonly transactions = new Map<string, Transaction>()
  private nextOrderId = 3_000_000_001

  private constructor(private readonly server: Server) {}

  static async start(): Promise<Przelewy24StandIn> {
    const server = createServer()
    const standIn = new Przelewy24StandIn(server)
    server.on('request', (request, response) => {
      void standIn.answer(request).then(({ status, body }) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(body))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return standIn
  }

  get url() {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  close() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  /** An account Przelewy24 knows, with the address of this API entered in its panel. */
  account(account: StandInAccount) {
    this.accounts.push(account)
    return account
  }

  transaction(sessionId: string) {
    return this.transactions.get(sessionId)
  }

  /** The calls of one kind it took, such as `PUT /api/v1/transaction/verify`. */
  calls(method: string, path: string) {
    return this.received.filter((call) => call.method === method && call.path.startsWith(path))
  }

  private known(sessionId: string) {
    const transaction = this.transactions.get(sessionId)
    if (!transaction) throw new Error(`Przelewy24 registered no transaction ${sessionId}`)
    return transaction
  }

  /**
   * The buyer pays the transaction: it is an advance payment until the shop verifies it. Answers
   * the notification Przelewy24 sends to `urlStatus`.
   */
  pay(
    sessionId: string,
    { amount, date = '20260501103000' }: { amount?: number; date?: string } = {},
  ) {
    const transaction = this.known(sessionId)
    const registered = transaction.registered.amount as number
    transaction.status = 1
    transaction.paid = amount ?? registered
    transaction.date = date
    const fields = {
      merchantId: transaction.account.merchantId,
      posId: transaction.account.posId,
      sessionId,
      amount: transaction.paid,
      originAmount: registered,
      currency: transaction.registered.currency as string,
      orderId: transaction.orderId,
      methodId: 154,
      statement: `p24-${transaction.orderId}`,
    }
    return { ...fields, sign: notificationSignature(fields, transaction.account.crc) }
  }

  /** A card is refused: the additional notification Przelewy24 sends of it. */
  cardRefused(sessionId: string, errorCode: string, errorMessage = 'Odmowa banku') {
    const transaction = this.known(sessionId)
    const fields = {
      amount: transaction.registered.amount as number,
      '3ds': true,
      method: 242,
      orderId: transaction.orderId,
      sessionId,
      errorCode,
      errorMessage,
    }
    return { ...fields, sign: cardFailureSignature(fields, transaction.account.crc) }
  }

  /** A card payment went through: the additional notification, with the card's details. */
  cardPaid(sessionId: string) {
    const transaction = this.known(sessionId)
    const fields = {
      amount: transaction.registered.amount as number,
      '3ds': true,
      method: 242,
      refId: 'card-reference-1',
      orderId: transaction.orderId,
      sessionId,
      bin: 411111,
      maskedCCNumber: '411111XXXXXX1111',
      ccExp: '122030',
      hash: 'card-hash-1',
      cardCountry: 'PL',
      risk: 0,
      liabilityshift: true,
    }
    return { ...fields, sign: cardSuccessSignature(fields, transaction.account.crc) }
  }

  private async answer(request: IncomingMessage): Promise<{ status: number; body: unknown }> {
    const method = request.method ?? 'GET'
    const path = (request.url ?? '').split('?')[0]!
    const body = await read(request)
    this.received.push({ method, path, body })
    if (this.down) return { status: 503, body: { error: 'Service unavailable', code: 503 } }

    const [scheme, encoded] = (request.headers.authorization ?? '').split(' ')
    const [posId, apiKey] = Buffer.from(encoded ?? '', 'base64')
      .toString('utf8')
      .split(':')
    const account = this.accounts.find(
      (known) => scheme === 'Basic' && String(known.posId) === posId && known.apiKey === apiKey,
    )
    if (!account) return { status: 401, body: { error: 'Incorrect authentication', code: 401 } }

    if (method === 'GET' && path === '/api/v1/testAccess') {
      return { status: 200, body: { data: true, error: '' } }
    }
    if (method === 'POST' && path === '/api/v1/transaction/register') {
      return this.register(account, body ?? {})
    }
    if (method === 'PUT' && path === '/api/v1/transaction/verify') {
      return this.verify(account, body ?? {})
    }
    const bySession = /^\/api\/v1\/transaction\/by\/sessionId\/(.+)$/.exec(path)
    if (method === 'GET' && bySession) {
      const transaction = this.transactions.get(decodeURIComponent(bySession[1]!))
      if (!transaction || transaction.account !== account) {
        return { status: 404, body: { error: 'Transaction not found', code: 404 } }
      }
      return {
        status: 200,
        body: {
          data: {
            statement: `p24-${transaction.orderId}`,
            orderId: transaction.orderId,
            sessionId: transaction.registered.sessionId,
            status: transaction.status,
            amount: transaction.paid ?? transaction.registered.amount,
            currency: transaction.registered.currency,
            date: transaction.date?.slice(0, 12) ?? '',
            dateOfTransaction: transaction.date ?? '',
            clientEmail: transaction.registered.email,
            accountMD5: '',
            paymentMethod: 154,
            description: transaction.registered.description,
            clientName: '',
            clientAddress: '',
            clientCity: '',
            clientPostcode: '',
            batchId: transaction.status === 2 ? 55001 : 0,
            fee: transaction.status === 2 ? '129' : '0',
          },
          responseCode: 0,
        },
      }
    }
    return { status: 404, body: { error: 'Not found', code: 404 } }
  }

  private register(account: StandInAccount, body: Record<string, unknown>) {
    const invalid = { status: 400, body: { error: 'Invalid input data', code: 400 } }
    const { sessionId, amount, currency, merchantId, posId, email } = body
    if (
      typeof sessionId !== 'string' ||
      typeof amount !== 'number' ||
      typeof currency !== 'string' ||
      merchantId !== account.merchantId ||
      posId !== account.posId ||
      typeof email !== 'string' ||
      email.length > 50 ||
      typeof body.description !== 'string' ||
      typeof body.urlReturn !== 'string' ||
      body.country !== 'PL' ||
      this.transactions.has(sessionId)
    ) {
      return invalid
    }
    const expected = registrationSignature(
      { sessionId, merchantId: account.merchantId, amount, currency },
      account.crc,
    )
    if (!signatureHolds(body.sign, expected)) {
      return { status: 400, body: { error: 'Incorrect CRC value', code: 400 } }
    }
    const token = `TOKEN-${sessionId}`
    this.transactions.set(sessionId, {
      account,
      token,
      registered: body,
      status: 0,
      orderId: this.nextOrderId++,
    })
    return { status: 200, body: { data: { token }, responseCode: 0 } }
  }

  private verify(account: StandInAccount, body: Record<string, unknown>) {
    if (this.verificationDown) {
      return { status: 503, body: { error: 'Service unavailable', code: 503 } }
    }
    const { sessionId, orderId, amount, currency } = body
    const transaction = typeof sessionId === 'string' ? this.transactions.get(sessionId) : undefined
    if (
      !transaction ||
      transaction.account !== account ||
      typeof orderId !== 'number' ||
      typeof amount !== 'number' ||
      typeof currency !== 'string' ||
      orderId !== transaction.orderId ||
      // Nothing was paid, or another amount than the one verified.
      transaction.paid === undefined ||
      amount !== transaction.paid
    ) {
      return { status: 400, body: { error: 'Incorrect CRC value', code: 400 } }
    }
    const expected = verificationSignature(
      { sessionId: sessionId as string, orderId, amount, currency },
      account.crc,
    )
    if (!signatureHolds(body.sign, expected)) {
      return { status: 400, body: { error: 'Incorrect CRC value', code: 400 } }
    }
    // A transaction already verified answers well again.
    transaction.status = 2
    return { status: 200, body: { data: { status: 'success' }, responseCode: 0 } }
  }
}
