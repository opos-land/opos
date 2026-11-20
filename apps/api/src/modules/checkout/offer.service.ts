import { Injectable } from '@nestjs/common'
import { type Offer, SHOP_CURRENCY } from '@opos/contract'
import { AddOnsRepository } from '../catalog/add-ons.repository'
import { CustomFieldsRepository } from '../catalog/custom-fields.repository'
import { MerchandiseRepository } from '../catalog/merchandise.repository'
import { TicketTypesRepository } from '../catalog/ticket-types.repository'
import { PaymentProviders } from '../payments/payment-providers'
import { ConsentsRepository } from '../shop/consents.repository'
import { DocumentsRepository } from '../shop/documents.repository'
import { offeredAddOn, offeredItem, offeredTicketType } from './offer'
import { OfferRepository } from './offer.repository'

/**
 * The offer of an edition's shop at a moment (docs/specs/0004-checkout-and-orders.md, S1-S6): what
 * anyone may see of it, and what a cart is priced against. It reads inside the transaction of the
 * tenant its caller opened; the caller found the edition, published, under that tenant.
 */
@Injectable()
export class OfferService {
  constructor(
    private readonly offers: OfferRepository,
    private readonly ticketTypes: TicketTypesRepository,
    private readonly addOns: AddOnsRepository,
    private readonly items: MerchandiseRepository,
    private readonly customFields: CustomFieldsRepository,
    private readonly documents: DocumentsRepository,
    private readonly consents: ConsentsRepository,
    private readonly providers: PaymentProviders,
  ) {}

  /**
   * The offer at `at`. `ticketsAt` prices the ticket types at another moment, for an order whose
   * total rests on a tier or a sale window that ended a little before: stock, capacity and
   * everything else are read as they stand at `at`.
   */
  of(tenantId: string, editionId: string, at = new Date(), ticketsAt = at): Promise<Offer> {
    return this.build(tenantId, editionId, at, ticketsAt, false)
  }

  /**
   * What an org sells from outside the shop (docs/specs/0006-order-management.md, M2): the offer
   * as the shop would make it at `at` were it open, so the same catalog at the prices in force,
   * with merchandise sold alone whatever the shop lets a buyer do.
   */
  atDesk(tenantId: string, editionId: string, at = new Date()): Promise<Offer> {
    return this.build(tenantId, editionId, at, at, true)
  }

  private async build(
    tenantId: string,
    editionId: string,
    at: Date,
    ticketsAt: Date,
    desk: boolean,
  ): Promise<Offer> {
    const shop = await this.offers.shop(editionId)
    const open = shop?.openedAt != null
    const documents = await this.documents.list(editionId)
    // The seller's details and the provider are for buyers: they stay behind the shop permission
    // until the edition's shop is open.
    const provider = open ? await this.offers.provider(tenantId) : undefined
    const pages = provider && this.providers.pages(provider)
    const footer = {
      salesClosedMessage: shop?.salesClosedMessage ?? null,
      currency: SHOP_CURRENCY,
      faqUrl: shop?.faqUrl ?? null,
      seller: open ? await this.offers.seller(tenantId) : null,
      provider:
        provider && pages
          ? { name: provider, methods: pages.methods, ...pages.requirements }
          : null,
      // The newest version of each document the shop shows; one with no version links nothing.
      documents: documents.flatMap((document) =>
        document.hidden || !document.versions[0]
          ? []
          : [{ kind: document.kind, title: document.title, versionId: document.versions[0].id }],
      ),
    } as const
    if (!desk && !open) {
      // A closed shop offers nothing: what it sells is not for anyone to read yet.
      return {
        ...footer,
        open: false,
        onSale: false,
        ageBands: null,
        guardianConsentFormUrl: null,
        merchPreorderDeadline: null,
        merchOnly: false,
        consents: [],
        customFields: [],
        ticketTypes: [],
        addOns: [],
        items: [],
      }
    }

    const held = await this.offers.held(editionId)
    const ticketTypes = (await this.ticketTypes.list(editionId)).flatMap(
      (type) => offeredTicketType(type, ticketsAt, held.ticketTypes.get(type.id) ?? 0) ?? [],
    )
    const addOns = (await this.addOns.list(editionId))
      .filter((addOn) => !addOn.hidden)
      .map((addOn) => offeredAddOn(addOn, held.addOns.get(addOn.id) ?? 0))
    const items = (await this.items.list(editionId))
      .filter((item) => !item.hidden)
      .map((item) => offeredItem(item, at, shop?.merchPreorderDeadline ?? null, held.variants))
    // At the desk merchandise is always sold alone, so that what ran out of it is named.
    const merchOnly =
      desk ||
      (shop?.merchOnlyEnabled === true &&
        items.some((item) => item.variants.some((variant) => variant.maxQuantity > 0)))
    const newest = new Map(documents.map((document) => [document.id, document.versions[0]?.id]))

    return {
      ...footer,
      open: true,
      onSale: merchOnly || ticketTypes.some((type) => type.state === 'on-sale'),
      ageBands:
        shop?.teenFromAge == null || shop.adultFromAge === null
          ? null
          : { teenFromAge: shop.teenFromAge, adultFromAge: shop.adultFromAge },
      guardianConsentFormUrl: shop?.guardianConsentFormUrl ?? null,
      merchPreorderDeadline: shop?.merchPreorderDeadline?.toISOString() ?? null,
      merchOnly,
      consents: (await this.consents.list(editionId))
        .filter((consent) => !consent.hidden)
        .map((consent) => ({
          id: consent.id,
          text: consent.text,
          isRequired: consent.isRequired,
          documentVersionId: (consent.documentId && newest.get(consent.documentId)) ?? null,
        })),
      customFields: (await this.customFields.list(editionId))
        .filter((field) => !field.hidden)
        .map(({ id, label, isRequired }) => ({ id, label, isRequired })),
      ticketTypes,
      addOns,
      items,
    }
  }
}
