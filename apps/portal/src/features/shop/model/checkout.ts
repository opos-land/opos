import {
  AGE_BANDS,
  type Cart,
  type Offer,
  type PlaceOrder,
  type PlaceVisitorOrder,
  priceCart,
} from '@opos/contract'
import { z } from 'zod'

// An unfinished checkout (docs/specs/0004-checkout-and-orders.md, C1-C19): what the buyer chose
// and typed, kept in the tab until the order is placed. It lives in the buyer's browser alone and
// holds no stock or capacity.

export const STEPS = ['holder', 'add-ons', 'merch', 'summary'] as const

/** A step of the checkout. `holder` is the ticket holder's, or the buyer's of merchandise alone. */
export type StepId = (typeof STEPS)[number]

const draftSchema = z.object({
  /** The ticket type chosen, or null for an order of merchandise alone. */
  ticketTypeId: z.string().nullable(),
  supporterPriceMinor: z.number().int().nullable(),
  holderName: z.string(),
  ageBand: z.enum(AGE_BANDS).nullable(),
  email: z.string(),
  emailConfirmation: z.string(),
  /** The answers to the edition's custom fields, by field. */
  answers: z.record(z.string(), z.string()),
  addOnIds: z.array(z.string()),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1) })),
  consentIds: z.array(z.string()),
  providerConsent: z.boolean(),
  guardianAcknowledged: z.boolean(),
  /** A buyer who is not signed in chose to go on without an account. */
  asVisitor: z.boolean(),
  step: z.enum(STEPS),
})

export type Draft = z.infer<typeof draftSchema>

export const emptyDraft = (ticketTypeId: string | null): Draft => ({
  ticketTypeId,
  supporterPriceMinor: null,
  holderName: '',
  ageBand: null,
  email: '',
  emailConfirmation: '',
  answers: {},
  addOnIds: [],
  items: [],
  consentIds: [],
  providerConsent: false,
  guardianAcknowledged: false,
  asVisitor: false,
  step: 'holder',
})

export const ticketTypeOf = (offer: Offer, draft: Pick<Draft, 'ticketTypeId'>) =>
  offer.ticketTypes.find((type) => type.id === draft.ticketTypeId)

/** The add-ons offered with the ticket type; an order of merchandise alone has none. */
export function offeredAddOns(offer: Offer, draft: Pick<Draft, 'ticketTypeId'>) {
  const type = ticketTypeOf(offer, draft)
  return offer.addOns.filter((addOn) => type?.addOnIds.includes(addOn.id))
}

/** The items offered with the ticket type, or every item to an order of merchandise alone. */
export function offeredItems(offer: Offer, draft: Pick<Draft, 'ticketTypeId'>) {
  if (draft.ticketTypeId === null) return offer.items
  const type = ticketTypeOf(offer, draft)
  return offer.items.filter((item) => type?.merchandiseItemIds.includes(item.id))
}

/** The steps the buyer goes through: one with nothing to offer is skipped and hidden. */
export function stepsOf(offer: Offer, draft: Pick<Draft, 'ticketTypeId'>): StepId[] {
  return STEPS.filter((step) => {
    if (step === 'add-ons') return offeredAddOns(offer, draft).length > 0
    if (step === 'merch') return offeredItems(offer, draft).length > 0
    return true
  })
}

export const cartOf = (draft: Draft): Cart => ({
  ticket:
    draft.ticketTypeId === null
      ? null
      : {
          ticketTypeId: draft.ticketTypeId,
          ...(draft.supporterPriceMinor !== null && {
            supporterPriceMinor: draft.supporterPriceMinor,
          }),
        },
  addOnIds: draft.addOnIds,
  items: draft.items,
})

/** The lines and the running total, by the function the API prices an order with. */
export const quoteOf = (offer: Offer, draft: Draft) => priceCart(offer, cartOf(draft))

/** What is wrong with a field of the first step. */
export type FieldIssue = 'required' | 'invalid' | 'mismatch' | 'too-long' | 'not-allowed'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The key of a custom field's answer among the fields of the first step. */
export const answerField = (fieldId: string) => `answer:${fieldId}`

/**
 * The fields of the first step that do not hold, each with what is wrong. A signed-in buyer's
 * email is the account's and is not asked; an order of merchandise alone asks no age band and no
 * custom field.
 */
export function holderIssues(
  offer: Offer,
  draft: Draft,
  signedIn: boolean,
): Record<string, FieldIssue> {
  const issues: Record<string, FieldIssue> = {}
  if (draft.holderName.trim() === '') issues.holderName = 'required'
  const type = ticketTypeOf(offer, draft)
  if (draft.ticketTypeId !== null) {
    if (draft.ageBand === null) issues.ageBand = 'required'
    else if (type && !type.ageBands.includes(draft.ageBand)) issues.ageBand = 'not-allowed'
  }
  if (!signedIn) {
    const email = draft.email.trim().toLowerCase()
    const confirmation = draft.emailConfirmation.trim().toLowerCase()
    if (email === '') issues.email = 'required'
    else if (!EMAIL.test(email)) issues.email = 'invalid'
    else if (offer.provider && email.length > offer.provider.maxEmailLength) {
      issues.email = 'too-long'
    }
    if (confirmation === '') issues.emailConfirmation = 'required'
    else if (!issues.email && confirmation !== email) issues.emailConfirmation = 'mismatch'
  }
  if (draft.ticketTypeId !== null) {
    for (const field of offer.customFields) {
      if (field.isRequired && (draft.answers[field.id] ?? '').trim() === '') {
        issues[answerField(field.id)] = 'required'
      }
    }
  }
  return issues
}

/**
 * What the summary still misses before the order can be placed: the required consents not
 * accepted, the provider's own while there is something to pay, and a teen's acknowledgement
 * that the guardian's consent is brought on paper.
 */
export function summaryIssues(offer: Offer, draft: Draft, totalMinor: number) {
  return {
    consents: offer.consents
      .filter((consent) => consent.isRequired && !draft.consentIds.includes(consent.id))
      .map((consent) => consent.id),
    provider: totalMinor > 0 && !!offer.provider?.consent && !draft.providerConsent,
    guardian: draft.ageBand === 'teen' && !draft.guardianAcknowledged,
  }
}

/**
 * The checkout with another ticket type: the add-ons the new one does not offer are removed and
 * named, and the merchandise is kept, as far as the new one offers it, when the buyer says so.
 */
export function withTicketType(
  offer: Offer,
  draft: Draft,
  ticketTypeId: string | null,
  keepMerchandise: boolean,
): { draft: Draft; removedAddOns: string[] } {
  const next = { ticketTypeId }
  const addOns = new Set(offeredAddOns(offer, next).map((addOn) => addOn.id))
  const variants = new Set(
    offeredItems(offer, next).flatMap((item) => item.variants.map((variant) => variant.id)),
  )
  const sameType = ticketTypeId === draft.ticketTypeId
  return {
    draft: {
      ...draft,
      ticketTypeId,
      supporterPriceMinor: sameType ? draft.supporterPriceMinor : null,
      ageBand: ticketTypeId === null ? null : draft.ageBand,
      addOnIds: draft.addOnIds.filter((id) => addOns.has(id)),
      items: keepMerchandise ? draft.items.filter((item) => variants.has(item.variantId)) : [],
      step: 'holder',
    },
    removedAddOns: offer.addOns
      .filter((addOn) => draft.addOnIds.includes(addOn.id) && !addOns.has(addOn.id))
      .map((addOn) => addOn.name),
  }
}

/**
 * How a checkout begins on its page: with what the tab kept, or empty for the ticket type the
 * address asks for (`null` for merchandise alone, `undefined` for nothing asked). A signed-in
 * buyer's name is filled in where none was typed. Another ticket type than the kept checkout is
 * for takes its place at once, unless merchandise was chosen: the buyer then says whether to
 * keep it (`ask`).
 */
export function beginCheckout(
  offer: Offer,
  kept: Draft | null,
  wanted: string | null | undefined,
  accountName: string,
): { draft: Draft | null; removedAddOns: string[]; ask: boolean } {
  const named = (draft: Draft): Draft =>
    draft.holderName === '' && accountName !== '' ? { ...draft, holderName: accountName } : draft
  if (!kept) {
    return {
      draft: wanted === undefined ? null : named(emptyDraft(wanted)),
      removedAddOns: [],
      ask: false,
    }
  }
  if (wanted === undefined || wanted === kept.ticketTypeId) {
    return { draft: named(kept), removedAddOns: [], ask: false }
  }
  if (kept.items.length > 0) return { draft: named(kept), removedAddOns: [], ask: true }
  const next = withTicketType(offer, kept, wanted, true)
  return { draft: named(next.draft), removedAddOns: next.removedAddOns, ask: false }
}

/**
 * The order the checkout places: the cart, the ticket holder's data, the consents and the total
 * the buyer saw. A signed-in buyer's carries no email: it is the account's.
 */
export function orderBody(
  draft: Draft,
  expectedTotalMinor: number,
  botCheckToken: string,
  signedIn: boolean,
): PlaceOrder | PlaceVisitorOrder {
  const merchOnly = draft.ticketTypeId === null
  const order: PlaceOrder = {
    cart: cartOf(draft),
    holderName: draft.holderName.trim(),
    ageBand: merchOnly ? null : draft.ageBand,
    customFieldAnswers: merchOnly
      ? []
      : Object.entries(draft.answers)
          .map(([fieldId, answer]) => ({ fieldId, answer: answer.trim() }))
          .filter(({ answer }) => answer !== ''),
    consentIds: draft.consentIds,
    providerConsentAccepted: draft.providerConsent,
    guardianConsentAcknowledged: draft.guardianAcknowledged,
    expectedTotalMinor,
    botCheckToken,
  }
  if (signedIn) return order
  return {
    ...order,
    email: draft.email.trim().toLowerCase(),
    emailConfirmation: draft.emailConfirmation.trim().toLowerCase(),
  }
}

const PREFIX = 'opos-checkout:'
const keyOf = (tenantSlug: string, editionSlug: string) => `${PREFIX}${tenantSlug}:${editionSlug}`

/**
 * The tab's own storage: it can be missing or throw (private mode, blocked site data), and the
 * checkout then works without remembering.
 */
function tab<T>(act: (storage: Storage) => T): T | null {
  try {
    return act(window.sessionStorage)
  } catch {
    return null
  }
}

/** The checkout of the edition this tab holds, or null: anything that is not one is ignored. */
export function loadDraft(tenantSlug: string, editionSlug: string): Draft | null {
  const stored = tab((storage) => storage.getItem(keyOf(tenantSlug, editionSlug)))
  if (!stored) return null
  try {
    const draft = draftSchema.safeParse(JSON.parse(stored))
    return draft.success ? draft.data : null
  } catch {
    return null
  }
}

export function saveDraft(tenantSlug: string, editionSlug: string, draft: Draft) {
  tab((storage) => storage.setItem(keyOf(tenantSlug, editionSlug), JSON.stringify(draft)))
}

/** Forgets the checkout of the edition: its order is placed, or the buyer gave it up. */
export function clearDraft(tenantSlug: string, editionSlug: string) {
  tab((storage) => storage.removeItem(keyOf(tenantSlug, editionSlug)))
}

/** Forgets every checkout of the tab, as a sign-out does. */
export function clearDrafts() {
  tab((storage) => {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) if (key?.startsWith(PREFIX)) storage.removeItem(key)
  })
}

/**
 * Forgets every checkout of the tab whenever its account signs out or its session ends: `watch`
 * is the session store's `subscribe`. Answers the way to stop.
 */
export function forgetDraftsAtSignOut(
  watch: (
    listener: (state: { account: unknown }, previous: { account: unknown }) => void,
  ) => () => void,
) {
  return watch((state, previous) => {
    if (previous.account !== null && state.account === null) clearDrafts()
  })
}
