import { Module } from '@nestjs/common'
import { ConnectProviderPreparation } from './connect-provider.preparation'
import { ConsentsController } from './consents.controller'
import { ConsentsRepository } from './consents.repository'
import { DocumentsController } from './documents.controller'
import { DocumentsRepository } from './documents.repository'
import { EditionShopController } from './edition-shop.controller'
import { EditionShopsRepository } from './edition-shops.repository'
import { ProviderAccountRepository } from './provider-account.repository'
import { SellerRepository } from './seller.repository'
import { ShopConditions } from './shop-conditions'
import { ShopController } from './shop.controller'

@Module({
  controllers: [ShopController, EditionShopController, DocumentsController, ConsentsController],
  providers: [
    SellerRepository,
    ProviderAccountRepository,
    EditionShopsRepository,
    DocumentsRepository,
    ConsentsRepository,
    ShopConditions,
    ConnectProviderPreparation,
  ],
  // The public route that serves a published version reads which file it points at; the shop's
  // offer reads the documents and the consents of an edition.
  exports: [DocumentsRepository, ConsentsRepository],
})
export class ShopModule {}
