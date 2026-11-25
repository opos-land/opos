import { type Credentials, type FailureReason } from '../provider'

/** The fields of the credentials an org gives to connect a Przelewy24 account. */
export const FIELDS = {
  merchantId: 'merchantId',
  posId: 'posId',
  /** The CRC key, which signs what goes to and comes from the provider. */
  crc: 'crc',
  /** The API key, which Przelewy24's panel calls the reports key. */
  apiKey: 'apiKey',
  /** Whether it is a sandbox account: `true` or `false`. */
  sandbox: 'sandbox',
  /**
   * The org's word that Przelewy24's own email finishing an abandoned payment is off for the
   * account: `true` or `false`. With it on, a buyer could pay an order after its hold.
   */
  abandonedPaymentEmailOff: 'abandonedPaymentEmailOff',
} as const

/** A Przelewy24 account, as its credentials name it. */
export interface Przelewy24Account {
  merchantId: number
  posId: number
  crc: string
  apiKey: string
  sandbox: boolean
  abandonedPaymentEmailOff: boolean
}

const identifier = (value: string | undefined) =>
  value !== undefined && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : undefined

const key = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const answer = (value: string | undefined) =>
  value === 'true' ? true : value === 'false' ? false : undefined

/** Reads the credentials an org gave, or undefined when they do not name an account. */
export function accountOf(credentials: Credentials): Przelewy24Account | undefined {
  const account = {
    merchantId: identifier(credentials[FIELDS.merchantId]),
    posId: identifier(credentials[FIELDS.posId]),
    crc: key(credentials[FIELDS.crc]),
    apiKey: key(credentials[FIELDS.apiKey]),
    sandbox: answer(credentials[FIELDS.sandbox]),
    abandonedPaymentEmailOff: answer(credentials[FIELDS.abandonedPaymentEmailOff]),
  }
  return Object.values(account).includes(undefined) ? undefined : (account as Przelewy24Account)
}

/**
 * Whether two sets of credentials name one account: the same merchant and point of sale, in the
 * same environment, since the sandbox knows no transaction of production. The keys and the org's
 * answers are not the account: a transaction registered with the one is read and verified with
 * the other.
 */
export function sameAccount(one: Credentials, other: Credentials): boolean {
  const [first, second] = [accountOf(one), accountOf(other)]
  return (
    first !== undefined &&
    second !== undefined &&
    first.merchantId === second.merchantId &&
    first.posId === second.posId &&
    first.sandbox === second.sandbox
  )
}

/**
 * The codes of Przelewy24 the shop reads a reason from, by the general list of its
 * documentation. Which codes a refused card carries the documentation does not say: any other
 * code is the general failure, and the provider's own code and message stay on the attempt.
 */
const REASONS: Readonly<Record<string, FailureReason>> = {
  // The transaction request was cancelled by the user.
  err161: 'canceled',
  err162: 'canceled',
  // The time available to complete the transaction has expired; completed after it.
  err102: 'timed-out',
  err105: 'timed-out',
  // Invalid card; the transaction risk-assessment score is too high.
  err56: 'declined',
  err49: 'declined',
}

export const reasonOf = (code: string): FailureReason => REASONS[code.toLowerCase()] ?? 'failed'

/** How far Warsaw's clock is ahead of UTC at a moment, in milliseconds. */
function warsawOffset(at: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const of = (type: string) => Number(parts.find((part) => part.type === type)!.value)
  const shown = Date.UTC(
    of('year'),
    of('month') - 1,
    of('day'),
    of('hour'),
    of('minute'),
    of('second'),
  )
  return shown - Math.floor(at / 1000) * 1000
}

/**
 * A date as Przelewy24 writes it: digits of a year, month, day, hour, minute and perhaps a
 * second, on its own clock, which is Warsaw's; or a date that names its zone. Undefined for
 * anything else: the documentation gives the format of neither field.
 */
export function providerDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const digits = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(value)
  if (digits) {
    const [year, month, day, hour, minute, second] = digits
      .slice(1)
      .map((part) => Number(part ?? 0)) as [number, number, number, number, number, number]
    const local = Date.UTC(year, month - 1, day, hour, minute, second)
    // A day that does not exist rolls over: such digits are no date.
    if (new Date(local).getUTCMonth() !== month - 1) return undefined
    const moment = local - warsawOffset(local - warsawOffset(local))
    return new Date(moment)
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(value)) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
