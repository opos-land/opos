import { Module } from '@nestjs/common'
import { CheckoutModule } from '../checkout/checkout.module'
import { OrderLinksController } from './order-links.controller'
import { OrderLinksRepository } from './order-links.repository'
import { OrderLinks } from './order-links.service'

/** What a buyer does with an order once it is placed (docs/specs/0009-buyer-self-service.md). */
@Module({
  imports: [CheckoutModule],
  controllers: [OrderLinksController],
  providers: [OrderLinksRepository, OrderLinks],
})
export class BuyerOrdersModule {}
