import { type AddOn, type AddOnKind, type CreateAddOn } from '@opos/contract'

/** The fields of an add-on as a form holds them: text, as a person types it. */
export interface AddOnFields {
  name: string
  description: string
  price: string
  kind: AddOnKind
  capacity: string
  threshold: string
}

export const EMPTY_ADD_ON: AddOnFields = {
  name: '',
  description: '',
  price: '',
  kind: 'unlimited',
  capacity: '',
  threshold: '',
}

export type AddOnProblem = 'name' | 'price' | 'capacity' | 'threshold'

/** A whole number from zero as a person typed it, or null for anything else. */
export const wholeNumber = (text: string): number | null =>
  /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null

/**
 * The body of the request the fields make, or what is wrong with them. A kind that is not limited
 * sends no capacity and no threshold, whatever its fields still hold.
 */
export function addOnBody(
  fields: AddOnFields,
  parse: (text: string) => number | null,
): { body: Required<CreateAddOn> } | { problems: AddOnProblem[] } {
  const problems: AddOnProblem[] = []
  const name = fields.name.trim()
  const amountMinor = parse(fields.price)
  const limited = fields.kind === 'limited'
  const capacity = limited ? wholeNumber(fields.capacity) : null
  const threshold = limited && fields.threshold.trim() ? wholeNumber(fields.threshold) : null
  if (!name) problems.push('name')
  if (amountMinor === null) problems.push('price')
  if (limited && capacity === null) problems.push('capacity')
  if (limited && fields.threshold.trim() && (threshold === null || threshold < 1)) {
    problems.push('threshold')
  }
  if (problems.length > 0 || amountMinor === null) return { problems }
  return {
    body: {
      name,
      description: fields.description.trim(),
      amountMinor,
      kind: fields.kind,
      capacity,
      placesLeftThreshold: threshold,
    },
  }
}

/** The form of an add-on that exists, its price written as a field holds one. */
export const addOnFields = (
  addOn: AddOn,
  toInput: (amountMinor: number) => string,
): AddOnFields => ({
  name: addOn.name,
  description: addOn.description,
  price: toInput(addOn.amountMinor),
  kind: addOn.kind,
  capacity: addOn.capacity === null ? '' : String(addOn.capacity),
  threshold: addOn.placesLeftThreshold === null ? '' : String(addOn.placesLeftThreshold),
})
