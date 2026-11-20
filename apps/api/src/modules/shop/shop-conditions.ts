import { Injectable } from '@nestjs/common'
import { type EditionShop, SHOP_CONDITIONS, type ShopCondition } from '@opos/contract'
import { PaymentProviders } from '../payments/payment-providers'
import { DocumentsRepository } from './documents.repository'
import { ProviderAccountRepository } from './provider-account.repository'
import { SellerRepository } from './seller.repository'

/** The conditions of `conditions` that do not hold, in the order opening names them. */
export const missingOf = (conditions: EditionShop['conditions']): ShopCondition[] =>
  SHOP_CONDITIONS.filter((condition) => !conditions[condition])

/**
 * What opening the shop of an edition asks for (docs/specs/0002-shop-setup.md, O2 and O3), each
 * condition as a yes or a no: the convention's provider account ready to sell, its seller's
 * details complete, and a published version of the edition's shop terms and privacy policy. It
 * reads no credentials, and answers nothing more of the account or the details: an org with the
 * tickets permission alone learns only that much.
 */
@Injectable()
export class ShopConditions {
  constructor(
    private readonly sellers: SellerRepository,
    private readonly accounts: ProviderAccountRepository,
    private readonly documents: DocumentsRepository,
    private readonly providers: PaymentProviders,
  ) {}

  async of(editionId: string): Promise<EditionShop['conditions']> {
    const account = await this.accounts.readiness()
    const seller = await this.sellers.get()
    const published = await this.documents.publishedKinds(editionId)
    return {
      // An account whose provider has no module in this environment sells nothing.
      'provider-account':
        account !== undefined &&
        account.readyAt !== null &&
        this.providers.loaded(account.provider),
      'seller-details': seller.complete,
      'shop-terms': published.has('shop-terms'),
      'privacy-policy': published.has('privacy-policy'),
    }
  }
}
