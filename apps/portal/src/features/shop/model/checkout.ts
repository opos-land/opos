import {
  AGE_BANDS,
  type Cart,
  type MyOrder,
  type Offer,
  type PlaceOrder,
  type PlaceVisitorOrder,
  placeVisitorOrderSchema,
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
  /**
   * The edition's consents the buyer accepted, each with the version of the document it showed
   * then, or null where it showed none: an order attests a consent as its buyer saw it. A
   * checkout kept without them goes on with none accepted.
   */
  consents: z
    .array(z.object({ consentId: z.string(), documentVersionId: z.string().nullable() }))
    .default([]),
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
  /**
   * The key the checkout's order is placed with, sent with every try to place it: a try whose
   * answer never came is sent again with the same key, and the shop answers with the order it
   * placed then. It stands for what the checkout orders, so `rekeyed` draws a new one whenever
   * that changes. A checkout kept without one draws its own.
   */
  placementKey: z.uuid().default(() => newPlacementKey()),
  step: z.enum(STEPS),
})

export type Draft = z.infer<typeof draftSchema>

/**
 * A placement key: a random UUID nobody can guess, from the browser's own source of randomness,
 * which a page has also where it is served without TLS.
 */
export function newPlacementKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/**
 * What the checkout orders, as a text two checkouts that order the same share: all of it but the
 * step it is on and its placement key, whatever order the fields of an object were written in.
 */
const contentOf = (draft: Draft) =>
  JSON.stringify({ ...draft, step: null, placementKey: null }, (_, value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)))
      : value,
  )

/**
 * The checkout `after` as it goes on from `before`, which is null where it starts. The placement
 * key stands for what the checkout orders: on another step it stays, and once anything else
 * changed a new one is drawn. A try sent again unchanged is so answered with the order placed
 * before, and a changed checkout places an order of its own, whatever the tab kept its key for.
 */
export function rekeyed(before: Draft | null, after: Draft): Draft {
  const changed =
    before !== null &&
    after.placementKey === before.placementKey &&
    contentOf(after) !== contentOf(before)
  return changed ? { ...after, placementKey: newPlacementKey() } : after
}

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
  consents: [],
  providerConsent: false,
  guardianAcknowledged: false,
  asVisitor: false,
  discountCode: '',
  extending: null,
  placementKey: newPlacementKey(),
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

/**
 * The checkout as the offer now allows it. The tab keeps one for as long as it lives, and the shop
 * changes meanwhile: an add-on, a variant or a supporter price the checkout is no longer offered
 * leaves it, and `dropped` says that the order lost something. A consent and an answer the edition
 * no longer asks for leave it too, with nothing to say. None of them is on a step any more, so the
 * buyer could not take it out. A consent the shop now shows with another version of its document
 * than the one it was accepted with is accepted no longer, and `changedConsents` names it: the
 * buyer reads it and accepts it again. What merely ran out stays, for its step to mark. A checkout
 * whose ticket type is gone from the offer stays whole: the listing moves it to another one.
 */
export function fitToOffer(
  offer: Offer,
  draft: Draft,
): { draft: Draft; dropped: boolean; changedConsents: string[] } {
  const type = ticketTypeOf(offer, draft)
  if (!draft.extending && draft.ticketTypeId !== null && !type) {
    return { draft, dropped: false, changedConsents: [] }
  }
  const addOns = new Set(offeredAddOns(offer, draft).map((addOn) => addOn.id))
  const variants = new Set(
    offeredItems(offer, draft).flatMap((item) => item.variants.map((variant) => variant.id)),
  )
  const shown = new Map(offer.consents.map((consent) => [consent.id, consent.documentVersionId]))
  const fields = new Set(offer.customFields.map((field) => field.id))

  const chosen = draft.supporterPriceMinor
  const supporterPriceMinor =
    chosen !== null && type?.supporterPrices.includes(chosen) ? chosen : null
  const addOnIds = draft.addOnIds.filter((id) => addOns.has(id))
  const items = draft.items.filter((item) => variants.has(item.variantId))
  const consents = draft.consents.filter(
    (accepted) => shown.get(accepted.consentId) === accepted.documentVersionId,
  )
  const changedConsents = draft.consents
    .filter((accepted) => shown.has(accepted.consentId) && !consents.includes(accepted))
    .map((accepted) => accepted.consentId)
  const answers = Object.entries(draft.answers).filter(([fieldId]) => fields.has(fieldId))

  const dropped =
    supporterPriceMinor !== chosen ||
    addOnIds.length !== draft.addOnIds.length ||
    items.length !== draft.items.length
  const same =
    !dropped &&
    consents.length === draft.consents.length &&
    answers.length === Object.keys(draft.answers).length
  if (same) return { draft, dropped, changedConsents }
  return {
    draft: {
      ...draft,
      supporterPriceMinor,
      addOnIds,
      items,
      consents,
      answers: Object.fromEntries(answers),
    },
    dropped,
    changedConsents,
  }
}

/** What is wrong with a field of the first step. */
export type FieldIssue = 'required' | 'invalid' | 'mismatch' | 'too-long' | 'not-allowed'

/**
 * The email of a visitor's order as the shop takes it: its own rule, so the first step refuses
 * beside the field what the shop would refuse once the order is placed.
 */
const EMAIL = placeVisitorOrderSchema.shape.email

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
    else if (!EMAIL.safeParse(email).success) issues.email = 'invalid'
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

/** Whether the checkout holds the consent as accepted. */
export const isAccepted = (draft: Pick<Draft, 'consents'>, consentId: string) =>
  draft.consents.some((accepted) => accepted.consentId === consentId)

/**
 * The consents the checkout holds once `consent` is accepted or not: accepted with the version of
 * its document the offer shows, which is the one the buyer reads beside it.
 */
export function withConsent(
  draft: Pick<Draft, 'consents'>,
  consent: Offer['consents'][number],
  accepted: boolean,
): Draft['consents'] {
  const others = draft.consents.filter((own) => own.consentId !== consent.id)
  if (!accepted) return others
  return [...others, { consentId: consent.id, documentVersionId: consent.documentVersionId }]
}

/**
 * What the summary still misses before the order can be placed: the required consents not
 * accepted, the provider's own while there is something to pay, and a teen's acknowledgement
 * that the guardian's consent is brought on paper.
 */
export function summaryIssues(offer: Offer, draft: Draft, totalMinor: number) {
  return {
    consents: offer.consents
      .filter((consent) => consent.isRequired && !isAccepted(draft, consent.id))
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
    consents: draft.consents,
    providerConsentAccepted: draft.providerConsent,
    guardianConsentAcknowledged: draft.guardianAcknowledged,
    expectedTotalMinor,
    botCheckToken,
    placementKey: draft.placementKey,
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

/**
 * A checkout as the tab keeps it: with the account it was entered under, null for a visitor's
 * and for one kept before the account was noted.
 */
const keptSchema = draftSchema.extend({ accountId: z.string().nullable().default(null) })

/**
 * The checkout of the edition this tab holds for `accountId`, the account it shows, null for a
 * visitor; anything that is not a checkout is ignored. One entered under an account is that
 * account's alone: a sign-out clears it, and a tab that did not see the sign-out, asleep or
 * restored after its session ended, reads nothing of it. A visitor's is read by whoever signs
 * in, who goes on with what was entered.
 */
export function loadDraft(
  tenantSlug: string,
  editionSlug: string,
  extendsOrderId?: string,
  accountId: string | null = null,
): Draft | null {
  const stored = tab((storage) => storage.getItem(keyOf(tenantSlug, editionSlug, extendsOrderId)))
  if (!stored) return null
  try {
    const kept = keptSchema.safeParse(JSON.parse(stored))
    if (!kept.success) return null
    const { accountId: enteredUnder, ...draft } = kept.data
    return enteredUnder === null || enteredUnder === accountId ? draft : null
  } catch {
    return null
  }
}

/** Keeps the checkout in the tab, as entered under `accountId`: null for a visitor. */
export function saveDraft(
  tenantSlug: string,
  editionSlug: string,
  draft: Draft,
  accountId: string | null = null,
) {
  tab((storage) =>
    storage.setItem(
      keyOf(tenantSlug, editionSlug, draft.extending?.orderId),
      JSON.stringify({ ...draft, accountId }),
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
