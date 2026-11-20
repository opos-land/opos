import { Injectable } from '@nestjs/common'
import {
  type Extending,
  HOLD_MINUTES,
  MAX_UNPAID_ORDERS,
  type Offer,
  type PlacedOrder,
  type PlaceOrder,
  PRICE_GRACE_MINUTES,
  priceCart,
} from '@opos/contract'
import { notFound } from '../../common/errors/api-error'
import { TicketTypesRepository } from '../catalog/ticket-types.repository'
import { providerUnavailable } from '../shop/shop.errors'
import {
  cartRefusal,
  consentMissing,
  emailRefused,
  invalidOrder,
  notExtendable,
  orderUnavailable,
  tooManyUnpaid,
  totalChanged,
} from './checkout.errors'
import { hashOf, secretToken } from './codes'
import { type StoredDiscount } from './discounts.repository'
import { Discounts } from './discounts.service'
import { OfferService } from './offer.service'
import { OrderSettlement } from './order-settlement.service'
import { OrdersRepository } from './orders.repository'

const MINUTE = 60_000

/** Who places an order: the address it is under, and the account when one is signed in. */
export interface Buyer {
  email: string
  accountId?: string
}

/**
 * Places an order (docs/specs/0004-checkout-and-orders.md, O1-O13). It enforces every rule the
 * shop displays, so nothing is bought by going around the page. It runs in the transaction of
 * the order's tenant, after the bot check, which is a call out and so came before it.
 */
@Injectable()
export class OrderPlacement {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly offers: OfferService,
    private readonly ticketTypes: TicketTypesRepository,
    private readonly settlement: OrderSettlement,
    private readonly discounts: Discounts,
  ) {}

  async place(
    tenantId: string,
    editionId: string,
    input: PlaceOrder,
    buyer: Buyer,
    at = new Date(),
  ): Promise<PlacedOrder> {
    const email = buyer.email.trim().toLowerCase()
    // "Buy more" (docs/specs/0009-buyer-self-service.md, B1-B3): the account's own paid order
    // of this edition, its row locked before any limit. Another account's order is not there.
    let first: { id: string; holderName: string } | undefined
    let extending: Extending | undefined
    if (input.extendsOrderId !== undefined) {
      if (!buyer.accountId) throw notExtendable()
      const own = await this.orders.own(tenantId, buyer.accountId, input.extendsOrderId, true)
      if (!own) throw notFound('order')
      // An order whose email an org changed passed to another person: the account it stays on
      // adds nothing to it, and so never comes by the QR code its new holder was sent.
      if (own.editionId !== editionId || own.status !== 'paid' || own.email !== email) {
        throw notExtendable()
      }
      first = own
      extending = await this.orders.boughtWith(tenantId, own.id)
    }
    // The limits next: what the offer then counts of them, no other order changes meanwhile.
    await this.orders.lockLimits(editionId, input.cart)
    const offer = await this.offers.of(tenantId, editionId, at)
    // Also for an order with nothing to pay: one address serves every order of a buyer.
    if (offer.provider && email.length > offer.provider.maxEmailLength) throw emailRefused()

    // The discount code, last of the order's locks: its use is counted under the lock of its
    // row. One used up, ended or gone since the buyer entered it places no order, and the buyer
    // returns to the Summary with the code marked.
    let discount: StoredDiscount | undefined
    if (input.discountCode !== undefined) {
      discount = await this.discounts.usable(editionId, input.discountCode, at)
      if (!discount || !(await this.discounts.hasUse(editionId, discount.id, true))) {
        throw orderUnavailable({ kind: 'discount-code' })
      }
    }
    const { lines, totalMinor, rests } = await this.priced(
      tenantId,
      editionId,
      offer,
      input,
      at,
      discount,
      extending,
    )
    // The ticket type as the offer the price rests on shows it: one whose sale just ended is in
    // no offer of this moment.
    this.checkHolder(rests, input)
    this.checkConsents(offer, input, totalMinor)
    if (totalMinor > 0 && !offer.provider) {
      throw providerUnavailable('no module of the provider is loaded in this environment')
    }
    if ((await this.orders.unpaid(editionId, email)) >= MAX_UNPAID_ORDERS) {
      throw tooManyUnpaid(MAX_UNPAID_ORDERS)
    }

    const paid = totalMinor === 0
    if (!paid) await this.orders.holdProviderAccount(tenantId)
    const resultToken = secretToken()
    const placed = await this.orders.write(
      {
        tenantId,
        editionId,
        status: paid ? 'paid' : 'awaiting-payment',
        email,
        // What is bought later is for the ticket holder of the first order, whoever is named.
        holderName: first?.holderName ?? input.holderName,
        ageBand: input.ageBand,
        totalMinor,
        // An order with nothing to pay has nothing to wait for; any other holds for thirty minutes.
        holdEndsAt: paid ? null : new Date(at.getTime() + HOLD_MINUTES * MINUTE),
        placedAt: at,
        paidAt: paid ? at : null,
        guardianConsentAcknowledgedAt: input.ageBand === 'teen' ? at : null,
        providerConsentAcceptedAt: !paid && offer.provider?.consent ? at : null,
        resultTokenHash: hashOf(resultToken),
        discountCodeId: discount?.id ?? null,
        extendsOrderId: first?.id ?? null,
      },
      lines,
    )
    const of = { tenantId, editionId, orderId: placed.id }
    const versions = new Map(offer.consents.map((consent) => [consent.id, consent]))
    await this.orders.addHolderData(of, {
      answers: input.customFieldAnswers,
      consents: input.consentIds.map((consentId) => ({
        consentId,
        documentVersionId: versions.get(consentId)?.documentVersionId ?? null,
      })),
      acceptedAt: at,
    })
    if (buyer.accountId) await this.orders.attach(of, buyer.accountId)
    if (paid) await this.settlement.paid({ ...of, email })

    return {
      orderId: placed.id,
      number: placed.number,
      status: paid ? 'paid' : 'awaiting-payment',
      totalMinor,
      resultToken,
    }
  }

  /**
   * The lines and the total the order is placed at: the offer's as it stands, when that is the
   * total the buyer saw. Else those of a tier or a sale window of the ticket type that ended less
   * than thirty minutes before, when the buyer's total rests on it. Else nothing is placed: the
   * buyer is told the new total, or what cannot be had. `rests` is the offer the price rests on.
   */
  private async priced(
    tenantId: string,
    editionId: string,
    offer: Offer,
    input: PlaceOrder,
    at: Date,
    discount: StoredDiscount | undefined,
    extending: Extending | undefined,
  ) {
    const now = priceCart(offer, input.cart, discount, extending)
    if (!('problem' in now) && now.totalMinor === input.expectedTotalMinor) {
      return { ...now, rests: offer }
    }
    if (offer.open && input.cart.ticket) {
      for (const moment of await this.endedLately(editionId, input.cart.ticket.ticketTypeId, at)) {
        const earlier = await this.offers.of(tenantId, editionId, at, moment)
        const then = priceCart(earlier, input.cart, discount, extending)
        if (!('problem' in then) && then.totalMinor === input.expectedTotalMinor) {
          return { ...then, rests: earlier }
        }
      }
    }
    if ('problem' in now) throw cartRefusal(now.problem)
    throw totalChanged(now.totalMinor)
  }

  /**
   * The last moment of each tier and sale window of the ticket type that ended within the last
   * thirty minutes, the latest first. The thirty minutes run from the end itself.
   */
  private async endedLately(editionId: string, ticketTypeId: string, at: Date): Promise<Date[]> {
    const type = (await this.ticketTypes.list(editionId)).find((held) => held.id === ticketTypeId)
    if (!type) return []
    const ends = [type.saleEndsAt, ...type.tiers.map((tier) => tier.endsAt)].map((end) =>
      Date.parse(end),
    )
    const since = at.getTime() - PRICE_GRACE_MINUTES * MINUTE
    return [...new Set(ends)]
      .filter((end) => end > since && end <= at.getTime())
      .sort((a, b) => b - a)
      .map((end) => new Date(end - 1))
  }

  /** The ticket holder's age band and answers, as the ticket type and the edition ask for them. */
  private checkHolder(offer: Offer, input: PlaceOrder) {
    const ticketType = offer.ticketTypes.find((type) => type.id === input.cart.ticket?.ticketTypeId)
    if (!ticketType) {
      // A merch-only order has no ticket holder: no age band, and no custom field to answer.
      if (input.ageBand !== null) {
        throw invalidOrder('ageBand', 'An order without a ticket has no age band')
      }
      if (input.customFieldAnswers.length > 0) {
        throw invalidOrder('customFieldAnswers', 'An order without a ticket answers no field')
      }
      return
    }
    if (input.ageBand === null || !ticketType.ageBands.includes(input.ageBand)) {
      throw invalidOrder('ageBand', 'The ticket type does not allow the age band')
    }
    const fields = new Set(offer.customFields.map((field) => field.id))
    const answered = new Set(input.customFieldAnswers.map((answer) => answer.fieldId))
    if (
      answered.size !== input.customFieldAnswers.length ||
      [...answered].some((fieldId) => !fields.has(fieldId))
    ) {
      throw invalidOrder('customFieldAnswers', 'An answer names a field the edition does not ask')
    }
    if (offer.customFields.some((field) => field.isRequired && !answered.has(field.id))) {
      throw invalidOrder('customFieldAnswers', 'A required field has no answer')
    }
  }

  /**
   * Every required consent of the edition, a teen's acknowledgement that the guardian's consent
   * is brought on paper, and the provider's own consent while there is something to pay.
   */
  private checkConsents(offer: Offer, input: PlaceOrder, totalMinor: number) {
    const known = new Set(offer.consents.map((consent) => consent.id))
    const accepted = new Set(input.consentIds)
    if (
      accepted.size !== input.consentIds.length ||
      input.consentIds.some((id) => !known.has(id))
    ) {
      throw invalidOrder('consentIds', 'A consent is not one the edition asks for')
    }
    const missing = offer.consents.find(
      (consent) => consent.isRequired && !accepted.has(consent.id),
    )
    if (missing) throw consentMissing(missing.id)
    if (input.ageBand === 'teen' && !input.guardianConsentAcknowledged) {
      throw consentMissing('guardian')
    }
    if (totalMinor > 0 && offer.provider?.consent && !input.providerConsentAccepted) {
      throw consentMissing('provider')
    }
  }
}
