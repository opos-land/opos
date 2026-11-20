import { type CreateDiscountCode, type DiscountCode } from '@opos/contract'

/** The fields of a discount code as a form holds them: text, as a person types it. */
export interface DiscountCodeFields {
  code: string
  kind: DiscountCode['kind']
  percent: string
  amount: string
  /** Empty for no limit. */
  usageLimit: string
  /** The window, as the wall-clock time of the convention's time zone. */
  validFrom: string
  validUntil: string
  ticketTypeIds: string[]
  addOnIds: string[]
  itemIds: string[]
}

export const EMPTY_DISCOUNT_CODE: DiscountCodeFields = {
  code: '',
  kind: 'percent',
  percent: '',
  amount: '',
  usageLimit: '',
  validFrom: '',
  validUntil: '',
  ticketTypeIds: [],
  addOnIds: [],
  itemIds: [],
}

export type DiscountCodeProblem =
  'code' | 'percent' | 'amount' | 'usageLimit' | 'window' | 'appliesTo'

/** The request a form makes: the value of the code's kind alone, never the other's. */
export type DiscountCodeBody = Omit<CreateDiscountCode, 'percent' | 'amountMinor'> &
  ({ percent: number } | { amountMinor: number })

interface Readers {
  /** The amount a person typed, in the minor unit, or null. */
  parse: (text: string) => number | null
  /** The moment of a wall-clock time of the convention's time zone, or null. */
  fromInput: (value: string) => string | null
}

const CODE = /^[a-z0-9-]{4,40}$/i
const whole = (text: string): number | null =>
  /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null

/**
 * The body of the request the fields make, or what is wrong with them
 * (docs/specs/0008-discount-codes.md, D1-D4). The code goes as typed: the API keeps it in lower
 * case and reads it without regard to case.
 */
export function discountCodeBody(
  fields: DiscountCodeFields,
  { parse, fromInput }: Readers,
): { body: DiscountCodeBody } | { problems: DiscountCodeProblem[] } {
  const problems: DiscountCodeProblem[] = []
  const code = fields.code.trim()
  const percent = whole(fields.percent)
  const amountMinor = parse(fields.amount)
  const usageLimit = fields.usageLimit.trim() === '' ? null : whole(fields.usageLimit)
  const validFrom = fromInput(fields.validFrom)
  const validUntil = fromInput(fields.validUntil)

  if (!CODE.test(code)) problems.push('code')
  if (fields.kind === 'percent' && (percent === null || percent < 1 || percent > 100)) {
    problems.push('percent')
  }
  if (fields.kind === 'amount' && (amountMinor === null || amountMinor < 1)) {
    problems.push('amount')
  }
  if (fields.usageLimit.trim() !== '' && (usageLimit === null || usageLimit < 1)) {
    problems.push('usageLimit')
  }
  if (
    validFrom === null ||
    validUntil === null ||
    Date.parse(validUntil) <= Date.parse(validFrom)
  ) {
    problems.push('window')
  }
  if (fields.ticketTypeIds.length + fields.addOnIds.length + fields.itemIds.length === 0) {
    problems.push('appliesTo')
  }
  if (problems.length > 0 || validFrom === null || validUntil === null) return { problems }
  return {
    body: {
      code,
      kind: fields.kind,
      ...(fields.kind === 'percent' ? { percent: percent! } : { amountMinor: amountMinor! }),
      usageLimit,
      validFrom,
      validUntil,
      ticketTypeIds: fields.ticketTypeIds,
      addOnIds: fields.addOnIds,
      itemIds: fields.itemIds,
    },
  }
}

/** A code as the panel and the shop write it: in capitals, whatever case it was typed in. */
export const shownCode = (code: string) => code.toUpperCase()

/** The form of a code that exists, its amount and its window written as fields hold them. */
export const discountCodeFields = (
  code: DiscountCode,
  {
    toInput,
    toInputTime,
  }: { toInput: (amountMinor: number) => string; toInputTime: (iso: string) => string },
): DiscountCodeFields => ({
  code: shownCode(code.code),
  kind: code.kind,
  percent: code.percent === null ? '' : String(code.percent),
  amount: code.amountMinor === null ? '' : toInput(code.amountMinor),
  usageLimit: code.usageLimit === null ? '' : String(code.usageLimit),
  validFrom: toInputTime(code.validFrom),
  validUntil: toInputTime(code.validUntil),
  ticketTypeIds: code.ticketTypeIds,
  addOnIds: code.addOnIds,
  itemIds: code.itemIds,
})

/** Whether a code can be used at a moment, and the first reason it cannot. */
export type Standing = 'active' | 'ended' | 'expired' | 'not-yet' | 'used-up'

export function standingOf(
  code: Pick<DiscountCode, 'ended' | 'validFrom' | 'validUntil' | 'usageLimit' | 'uses'>,
  at: Date,
): Standing {
  if (code.ended) return 'ended'
  if (at.getTime() >= Date.parse(code.validUntil)) return 'expired'
  if (at.getTime() < Date.parse(code.validFrom)) return 'not-yet'
  if (code.usageLimit !== null && code.uses >= code.usageLimit) return 'used-up'
  return 'active'
}
