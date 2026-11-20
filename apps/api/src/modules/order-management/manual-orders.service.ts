import { Injectable } from '@nestjs/common'
import { type ManualOrder, type Offer, priceCart } from '@opos/contract'
import { cartRefusal, invalidOrder } from '../checkout/checkout.errors'
import { hashOf, secretToken } from '../checkout/codes'
import { OfferService } from '../checkout/offer.service'
import { OrdersRepository } from '../checkout/orders.repository'

/**
 * Records a sale made outside the shop (docs/specs/0006-order-management.md, M1-M6): a
 * "Paid - manual" order with its reason. It runs in the request's transaction, under the
 * tenant's write lock, and locks the rows that carry the limits its cart touches before it
 * counts, as an order placed in the shop does (docs/ARCHITECTURE.md, invariant 9).
 */
@Injectable()
export class ManualOrders {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly offers: OfferService,
  ) {}

  /** Answers the identifier of the order it recorded. */
  async record(
    tenantId: string,
    editionId: string,
    input: ManualOrder,
    at = new Date(),
  ): Promise<string> {
    await this.orders.lockLimits(editionId, input.cart)
    // The catalog as the shop prices and counts it at this moment: the tier in force, what is
    // left, what goes with what. A sale outside the shop does not wait for the shop to be open,
    // and sells merchandise alone whatever the shop lets a buyer do.
    const offer = await this.offers.atDesk(tenantId, editionId, at)
    const priced = priceCart(offer, input.cart)
    if ('problem' in priced) throw cartRefusal(priced.problem)
    this.checkHolder(offer, input)

    // A complimentary order sells the same catalog for nothing.
    const free = input.reason === 'complimentary'
    const lines = free
      ? priced.lines.map((line) => ({ ...line, unitAmountMinor: 0, amountMinor: 0 }))
      : priced.lines
    const recorded = await this.orders.write(
      {
        tenantId,
        editionId,
        status: 'paid-manual',
        // Nobody's: it asks for no email, sends none and is on no account.
        email: null,
        holderName: input.holderName,
        ageBand: input.ageBand,
        totalMinor: free ? 0 : priced.totalMinor,
        holdEndsAt: null,
        placedAt: at,
        paidAt: at,
        guardianConsentAcknowledgedAt: null,
        providerConsentAcceptedAt: null,
        // No result page is opened for it: the hash of a token nobody holds.
        resultTokenHash: hashOf(secretToken()),
        manualReason: input.reason,
        note: input.note,
      },
      lines,
      // What it sells is handed over at the desk as it is recorded.
      at,
    )
    await this.orders.addHolderData(
      { tenantId, editionId, orderId: recorded.id },
      { answers: input.customFieldAnswers, consents: [], acceptedAt: at },
    )
    return recorded.id
  }

  /**
   * With a ticket, the ticket holder's age band within the bands the ticket type allows; the
   * answers name fields the edition asks, and none is required. Without one there is no ticket
   * holder: no age band and no answer.
   */
  private checkHolder(offer: Offer, input: ManualOrder) {
    const ticketType = offer.ticketTypes.find((type) => type.id === input.cart.ticket?.ticketTypeId)
    if (!ticketType) {
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
  }
}
