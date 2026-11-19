import { Module } from '@nestjs/common'
import { ConnectProviderPreparation } from './connect-provider.preparation'
import { EditionShopsRepository } from './edition-shops.repository'
import { ProviderAccountRepository } from './provider-account.repository'
import { SellerRepository } from './seller.repository'
import { ShopController } from './shop.controller'

@Module({
  controllers: [ShopController],
  providers: [
    SellerRepository,
    ProviderAccountRepository,
    EditionShopsRepository,
    ConnectProviderPreparation,
  ],
})
export class ShopModule {}
