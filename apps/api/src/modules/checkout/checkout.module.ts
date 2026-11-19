import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module'
import { PaymentsModule } from '../payments/payments.module'
import { PublicModule } from '../public/public.module'
import { ShopModule } from '../shop/shop.module'
import { OfferRepository } from './offer.repository'
import { OfferService } from './offer.service'
import { ShopPublicController } from './shop.controller'

/** Checkout and orders (docs/specs/0004-checkout-and-orders.md). */
@Module({
  imports: [CatalogModule, ShopModule, PaymentsModule, PublicModule],
  controllers: [ShopPublicController],
  providers: [OfferRepository, OfferService],
})
export class CheckoutModule {}
