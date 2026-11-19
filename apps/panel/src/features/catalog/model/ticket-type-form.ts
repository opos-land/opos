import {
  AGE_BANDS,
  type AgeBand,
  type CreateTicketType,
  tiersOverlap,
  type TicketType,
} from '@opos/contract'
import { wholeNumber } from './add-on-form'

/** A price tier as a form holds it: its price as text, its moments as wall-clock times. */
export interface TierFields {
  price: string
  startsAt: string
  endsAt: string
}

/** The fields of a ticket type as a form holds them. */
export interface TicketTypeFields {
  name: string
  shortDescription: string
  longDescription: string
  /** Empty while the ticket type is not limited. */
  capacity: string
  saleStartsAt: string
  saleEndsAt: string
  ageBands: AgeBand[]
  discountsExcluded: boolean
  shownOutsideSaleWindow: boolean
  tiers: TierFields[]
  supporterPrices: string[]
  perks: string[]
  addOnIds: string[]
  merchandiseItemIds: string[]
}

export const EMPTY_TICKET_TYPE: TicketTypeFields = {
  name: '',
  shortDescription: '',
  longDescription: '',
  capacity: '',
  saleStartsAt: '',
  saleEndsAt: '',
  ageBands: [...AGE_BANDS],
  discountsExcluded: false,
  shownOutsideSaleWindow: false,
  tiers: [],
  supporterPrices: [],
  perks: [],
  addOnIds: [],
  merchandiseItemIds: [],
}

export type TicketTypeProblem =
  'name' | 'saleWindow' | 'capacity' | 'ageBands' | 'tiers' | 'tiersOverlap' | 'supporterPrices'

interface Readers {
  /** The amount a person typed, in minor units, or null. */
  parse: (text: string) => number | null
  /** The instant of a wall-clock time of the convention's zone, or null. */
  fromInput: (value: string) => string | null
}

const endsAfter = (startsAt: string, endsAt: string) => Date.parse(endsAt) > Date.parse(startsAt)

/**
 * The body of the request the fields make, or what is wrong with them. A row of a list left empty
 * is no entry of it.
 */
export function ticketTypeBody(
  fields: TicketTypeFields,
  { parse, fromInput }: Readers,
): { body: Required<CreateTicketType> } | { problems: TicketTypeProblem[] } {
  const problems: TicketTypeProblem[] = []
  const name = fields.name.trim()
  if (!name) problems.push('name')

  const saleStartsAt = fromInput(fields.saleStartsAt)
  const saleEndsAt = fromInput(fields.saleEndsAt)
  if (!saleStartsAt || !saleEndsAt || !endsAfter(saleStartsAt, saleEndsAt)) {
    problems.push('saleWindow')
  }

  const capacity = fields.capacity.trim() ? wholeNumber(fields.capacity) : null
  if (fields.capacity.trim() && capacity === null) problems.push('capacity')
  if (fields.ageBands.length === 0) problems.push('ageBands')

  const tiers = fields.tiers.map((tier) => ({
    amountMinor: parse(tier.price),
    startsAt: fromInput(tier.startsAt),
    endsAt: fromInput(tier.endsAt),
  }))
  const whole = tiers.filter(
    (tier): tier is { amountMinor: number; startsAt: string; endsAt: string } =>
      tier.amountMinor !== null &&
      tier.startsAt !== null &&
      tier.endsAt !== null &&
      endsAfter(tier.startsAt, tier.endsAt),
  )
  if (whole.length !== tiers.length) problems.push('tiers')
  else if (tiersOverlap(whole)) problems.push('tiersOverlap')

  const supporterPrices = fields.supporterPrices
    .filter((price) => price.trim())
    .map((price) => parse(price))
  if (
    supporterPrices.some((amount) => amount === null || amount < 1) ||
    new Set(supporterPrices).size !== supporterPrices.length
  ) {
    problems.push('supporterPrices')
  }

  if (problems.length > 0 || !saleStartsAt || !saleEndsAt) return { problems }
  return {
    body: {
      name,
      shortDescription: fields.shortDescription.trim(),
      longDescription: fields.longDescription.trim(),
      capacity,
      saleStartsAt,
      saleEndsAt,
      ageBands: AGE_BANDS.filter((band) => fields.ageBands.includes(band)),
      discountsExcluded: fields.discountsExcluded,
      shownOutsideSaleWindow: fields.shownOutsideSaleWindow,
      tiers: whole,
      supporterPrices: supporterPrices as number[],
      perks: fields.perks.map((perk) => perk.trim()).filter(Boolean),
      addOnIds: fields.addOnIds,
      merchandiseItemIds: fields.merchandiseItemIds,
    },
  }
}

/** The form of a ticket type that exists, its prices and its moments as fields hold them. */
export function ticketTypeFields(
  type: TicketType,
  {
    toInput,
    toInputTime,
  }: { toInput: (amountMinor: number) => string; toInputTime: (iso: string) => string },
): TicketTypeFields {
  return {
    name: type.name,
    shortDescription: type.shortDescription,
    longDescription: type.longDescription,
    capacity: type.capacity === null ? '' : String(type.capacity),
    saleStartsAt: toInputTime(type.saleStartsAt),
    saleEndsAt: toInputTime(type.saleEndsAt),
    ageBands: type.ageBands,
    discountsExcluded: type.discountsExcluded,
    shownOutsideSaleWindow: type.shownOutsideSaleWindow,
    tiers: type.tiers.map((tier) => ({
      price: toInput(tier.amountMinor),
      startsAt: toInputTime(tier.startsAt),
      endsAt: toInputTime(tier.endsAt),
    })),
    supporterPrices: type.supporterPrices.map(toInput),
    perks: type.perks,
    addOnIds: type.addOnIds,
    merchandiseItemIds: type.merchandiseItemIds,
  }
}
