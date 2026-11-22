import {
  AGE_BANDS,
  type Cart,
  type MyOrder,
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
  /**
   * The discount code the buyer entered at the Summary, as typed; empty for none. The shop alone
   * knows a code's terms: whether this one is applied is what its quote answers.
   */
  discountCode: z.string().default(''),
  /**
   * The paid order a "Buy more" checkout adds to (docs/specs/0009-buyer-self-service.md, B1-B3):
   * its ticket holder, the ticket type of its ticket and what was bought on its QR code already.
   * Null for a checkout of its own.
   */
  extending: z
    .object({
      orderId: z.string(),
      number: z.string(),
      holderName: z.string(),
      ticketTypeId: z.string().nullable(),
      addOnIds: z.array(z.string()),
      itemIds: z.array(z.string()),
    })
    .nullable()
    .default(null),
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
  discountCode: '',
  extending: null,
  step: 'holder',
})

export const ticketTypeOf = (offer: Offer, draft: Pick<Draft, 'ticketTypeId'>) =>
  offer.ticketTypes.find((type) => type.id === draft.ticketTypeId)

/**
 * The age band a checkout of the ticket type starts with: the adult one, as most ticket holders
 * are adults, or none where the ticket type is not sold to them and the buyer has to choose.
 */
const startingAgeBand = (offer: Offer, ticketTypeId: string | null): Draft['ageBand'] =>
  ticketTypeOf(offer, { ticketTypeId })?.ageBands.includes('adult') ? 'adult' : null

/** What decides the offer of a checkout: its ticket type, or the order it adds to. */
type Offered = Pick<Draft, 'ticketTypeId'> & Partial<Pick<Draft, 'extending'>>

/**
 * The ticket type whose add-ons and merchandise the checkout is offered: the one being bought,
 * or the one of the order "Buy more" adds to. Null for merchandise alone.
 */
const offeringTypeId = (draft: Offered) =>
  draft.extending ? draft.extending.ticketTypeId : draft.ticketTypeId

/** The add-ons offered with the ticket type; an order of merchandise alone has none. */
export function offeredAddOns(offer: Offer, draft: Offered) {
  const type = ticketTypeOf(offer, { ticketTypeId: offeringTypeId(draft) })
  return offer.addOns.filter((addOn) => type?.addOnIds.includes(addOn.id))
}

/** The items offered with the ticket type, or every item to an order of merchandise alone. */
export function offeredItems(offer: Offer, draft: Offered) {
  const ticketTypeId = offeringTypeId(draft)
  if (ticketTypeId === null) return offer.items
  const type = ticketTypeOf(offer, { ticketTypeId })
  return offer.items.filter((item) => type?.merchandiseItemIds.includes(item.id))
}

/**
 * The steps the buyer goes through: one with nothing to offer is skipped and hidden. "Buy more"
 * asks nothing of the ticket holder again.
 */
export function stepsOf(offer: Offer, draft: Offered): StepId[] {
  return STEPS.filter((step) => {
    if (step === 'holder') return !draft.extending
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
export const quoteOf = (offer: Offer, draft: Draft) =>
  priceCart(offer, cartOf(draft), undefined, draft.extending ?? undefined)

/** What a checkout keeps of the order it adds to. */
const extendingOf = (order: MyOrder): NonNullable<Draft['extending']> => ({
  orderId: order.id,
  number: order.number,
  holderName: order.holderName,
  ticketTypeId: order.bought?.ticketTypeId ?? null,
  addOnIds: order.bought?.addOnIds ?? [],
  itemIds: order.bought?.itemIds ?? [],
})

/**
 * A "Buy more" checkout for a paid order, on its first step: no ticket, the same ticket holder,
 * and nothing chosen yet.
 */
export function extensionDraft(offer: Offer, order: MyOrder): Draft {
  const draft = {
    ...emptyDraft(null),
    holderName: order.holderName,
    extending: extendingOf(order),
  }
  return { ...draft, step: stepsOf(offer, draft)[0] ?? 'summary' }
}

/**
 * A kept "Buy more" checkout taken up again: with what was bought on the order's QR code since,
 * and without an add-on bought meanwhile, which is taken once.
 */
export function resumeExtension(offer: Offer, kept: Draft, order: MyOrder): Draft {
  const extending = extendingOf(order)
  const draft = {
    ...kept,
    ticketTypeId: null,
    holderName: order.holderName,
    extending,
    addOnIds: kept.addOnIds.filter((id) => !extending.addOnIds.includes(id)),
  }
  const steps = stepsOf(offer, draft)
  return steps.includes(draft.step) ? draft : { ...draft, step: steps[0] ?? 'summary' }
}

/** What is wrong with a field of the first step. */
export type FieldIssue = 'required' | 'invalid' | 'mismatch' | 'too-long' | 'not-allowed'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The key of a custom field's answer among the fields of the first step. */
export const answerField = (fieldId: string) => `answer:${fieldId}`

/**
 * The fields of the first step that do not hold, each with what is wrong. `accountEmail` is the
 * signed-in buyer's, null for a visitor: an account's email is not asked, but one the provider's
 * module cannot take cannot pay through it, and the buyer is stopped before the order is placed.
 * An order of merchandise alone asks no age band and no custom field. The name is never one of
 * them: nobody has to be named.
 */
export function holderIssues(
  offer: Offer,
  draft: Draft,
  accountEmail: string | null,
): Record<string, FieldIssue> {
  const signedIn = accountEmail !== null
  const issues: Record<string, FieldIssue> = {}
  const type = ticketTypeOf(offer, draft)
  if (draft.ticketTypeId !== null) {
    if (draft.ageBand === null) issues.ageBand = 'required'
    else if (type && !type.ageBands.includes(draft.ageBand)) issues.ageBand = 'not-allowed'
  }
  if (signedIn && offer.provider && accountEmail.length > offer.provider.maxEmailLength) {
    issues.accountEmail = 'too-long'
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
 * The age band chosen stays, and a checkout that had none starts with the new ticket type's.
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
      ageBand:
        ticketTypeId === null ? null : (draft.ageBand ?? startingAgeBand(offer, ticketTypeId)),
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
 * address asks for (`null` for merchandise alone, `undefined` for nothing asked). A new one starts
 * with the adult age band where its ticket type is sold to adults. A signed-in buyer's name is
 * filled in where none was typed, on the first step alone: a buyer who went on with no name left
 * it out. Another ticket type than the kept checkout is for takes its place at once, unless
 * merchandise was chosen: the buyer then says whether to keep it (`ask`).
 */
export function beginCheckout(
  offer: Offer,
  kept: Draft | null,
  wanted: string | null | undefined,
  accountName: string,
): { draft: Draft | null; removedAddOns: string[]; ask: boolean } {
  const named = (draft: Draft): Draft =>
    draft.step === 'holder' && draft.holderName === '' && accountName !== ''
      ? { ...draft, holderName: accountName }
      : draft
  if (!kept) {
    return {
      draft:
        wanted === undefined
          ? null
          : named({ ...emptyDraft(wanted), ageBand: startingAgeBand(offer, wanted) }),
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
  /** Whether the shop applied the code the draft holds: one it refused is not sent. */
  discountApplied = false,
): PlaceOrder | PlaceVisitorOrder {
  const merchOnly = draft.ticketTypeId === null
  const order: PlaceOrder = {
    cart: cartOf(draft),
    // What is bought later is for the ticket holder of the order it adds to.
    holderName: draft.extending?.holderName ?? draft.holderName.trim(),
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
    ...(discountApplied &&
      draft.discountCode.trim() !== '' && { discountCode: draft.discountCode.trim() }),
    ...(draft.extending && { extendsOrderId: draft.extending.orderId }),
  }
  if (signedIn) return order
  return {
    ...order,
    email: draft.email.trim().toLowerCase(),
    emailConfirmation: draft.emailConfirmation.trim().toLowerCase(),
  }
}

const PREFIX = 'opos-checkout:'
/** A "Buy more" checkout is kept apart, under the order it adds to. */
const keyOf = (tenantSlug: string, editionSlug: string, extendsOrderId?: string | null) =>
  `${PREFIX}${tenantSlug}:${editionSlug}${extendsOrderId ? `:more:${extendsOrderId}` : ''}`

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
export function loadDraft(
  tenantSlug: string,
  editionSlug: string,
  extendsOrderId?: string,
): Draft | null {
  const stored = tab((storage) => storage.getItem(keyOf(tenantSlug, editionSlug, extendsOrderId)))
  if (!stored) return null
  try {
    const draft = draftSchema.safeParse(JSON.parse(stored))
    return draft.success ? draft.data : null
  } catch {
    return null
  }
}

export function saveDraft(tenantSlug: string, editionSlug: string, draft: Draft) {
  tab((storage) =>
    storage.setItem(
      keyOf(tenantSlug, editionSlug, draft.extending?.orderId),
      JSON.stringify(draft),
    ),
  )
}

/** Forgets the checkout of the edition: its order is placed, or the buyer gave it up. */
export function clearDraft(tenantSlug: string, editionSlug: string, extendsOrderId?: string) {
  tab((storage) => storage.removeItem(keyOf(tenantSlug, editionSlug, extendsOrderId)))
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
