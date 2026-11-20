import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * A signature of Przelewy24: the SHA-384 of the JSON of the fields the documentation lists, in
 * its order, with the CRC key of the account as the last one. The JSON is written as the provider
 * writes it: no space, and neither a slash nor a letter outside ASCII escaped, which is what
 * JSON.stringify does.
 */
export const signatureOf = (
  fields: Readonly<Record<string, string | number | boolean>>,
  crc: string,
) =>
  createHash('sha384')
    .update(JSON.stringify({ ...fields, crc }))
    .digest('hex')

/** What registering a transaction is signed with. */
export const registrationSignature = (
  of: { sessionId: string; merchantId: number; amount: number; currency: string },
  crc: string,
) =>
  signatureOf(
    {
      sessionId: of.sessionId,
      merchantId: of.merchantId,
      amount: of.amount,
      currency: of.currency,
    },
    crc,
  )

/** The fields of a notification of a payment made, as Przelewy24 sends and signs them. */
export interface PaymentNotification {
  merchantId: number
  posId: number
  sessionId: string
  /** The amount paid, in grosze. */
  amount: number
  /** The amount registered. */
  originAmount: number
  currency: string
  /** Przelewy24's own number of the transaction: it outgrows a 32-bit number. */
  orderId: number
  methodId: number
  statement: string
  sign: string
}

export const notificationSignature = (of: Omit<PaymentNotification, 'sign'>, crc: string) =>
  signatureOf(
    {
      merchantId: of.merchantId,
      posId: of.posId,
      sessionId: of.sessionId,
      amount: of.amount,
      originAmount: of.originAmount,
      currency: of.currency,
      orderId: of.orderId,
      methodId: of.methodId,
      statement: of.statement,
    },
    crc,
  )

/** What verifying a transaction is signed with. */
export const verificationSignature = (
  of: { sessionId: string; orderId: number; amount: number; currency: string },
  crc: string,
) =>
  signatureOf(
    { sessionId: of.sessionId, orderId: of.orderId, amount: of.amount, currency: of.currency },
    crc,
  )

/**
 * The fields of an additional notification of a card payment that went through. Nothing of the
 * card they carry is stored or logged: they are read to judge the signature alone.
 */
export interface CardSuccess {
  amount: number
  '3ds': boolean
  method: number
  refId: string
  orderId: number
  sessionId: string
  bin: number
  maskedCCNumber: string
  ccExp: string
  hash: string
  cardCountry: string
  risk: number
  liabilityshift: boolean
}

export const cardSuccessSignature = (of: CardSuccess, crc: string) =>
  signatureOf(
    {
      amount: of.amount,
      '3ds': of['3ds'],
      method: of.method,
      refId: of.refId,
      orderId: of.orderId,
      sessionId: of.sessionId,
      bin: of.bin,
      maskedCCNumber: of.maskedCCNumber,
      ccExp: of.ccExp,
      hash: of.hash,
      cardCountry: of.cardCountry,
      risk: of.risk,
      liabilityshift: of.liabilityshift,
    },
    crc,
  )

/** The fields of an additional notification of a card payment refused. */
export interface CardFailure {
  amount: number
  '3ds': boolean
  method: number
  orderId: number
  sessionId: string
  errorCode: string
  errorMessage: string
}

export const cardFailureSignature = (of: CardFailure, crc: string) =>
  signatureOf(
    {
      amount: of.amount,
      '3ds': of['3ds'],
      method: of.method,
      orderId: of.orderId,
      sessionId: of.sessionId,
      errorCode: of.errorCode,
      errorMessage: of.errorMessage,
    },
    crc,
  )

/** Whether a signature is the one expected, compared in constant time. */
export function signatureHolds(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const [a, b] = [Buffer.from(given.toLowerCase()), Buffer.from(expected)]
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The time limit of a transaction: the whole minutes left of the order's hold, at least one and
 * at most the 99 the provider takes.
 */
export const timeLimitMinutes = (holdEndsAt: Date, now: Date) =>
  Math.min(99, Math.max(1, Math.floor((holdEndsAt.getTime() - now.getTime()) / 60_000)))

/**
 * The channels a transaction offers: cards with Apple Pay and Google Pay (1), bank transfers (2)
 * and BLIK (8192). Neither the traditional transfer nor the advance payment, instalments or
 * wallets.
 */
export const CHANNELS = 1 + 2 + 8192
