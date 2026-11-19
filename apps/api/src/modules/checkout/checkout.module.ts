import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module'
import { MailModule } from '../mail/mail.module'
import { PaymentsModule } from '../payments/payments.module'
import { PublicModule } from '../public/public.module'
import { ShopModule } from '../shop/shop.module'
import { ENV, type Env } from '../../config/env'
import { BOT_CHECK, botCheckOf } from './bot-check'
import { BotCheckPreparation } from './bot-check.preparation'
import { OfferRepository } from './offer.repository'
import { OfferService } from './offer.service'
import { OrderEmailsRepository } from './order-emails.repository'
import { OrderEmailsOutbox } from './order-emails.service'
import { OrderExpiry } from './order-expiry.service'
import { OrderPlacement } from './order-placement.service'
import { OrderSettlement } from './order-settlement.service'
import { OrdersController } from './orders.controller'
import { OrdersRepository } from './orders.repository'
import { PaymentAttempts } from './payment-attempts.service'
import { PaymentConfirmations } from './payment-confirmations.service'
import { PaymentsController } from './payments.controller'
import { PaymentsRepository } from './payments.repository'
import { ShopPublicController } from './shop.controller'

/** Checkout and orders (docs/specs/0004-checkout-and-orders.md). */
@Module({
  imports: [CatalogModule, ShopModule, PaymentsModule, PublicModule, MailModule],
  controllers: [ShopPublicController, OrdersController, PaymentsController],
  providers: [
    OfferRepository,
    OfferService,
    OrdersRepository,
    OrderPlacement,
    OrderSettlement,
    PaymentsRepository,
    PaymentConfirmations,
    PaymentAttempts,
    OrderExpiry,
    OrderEmailsRepository,
    OrderEmailsOutbox,
    BotCheckPreparation,
    { provide: BOT_CHECK, inject: [ENV], useFactory: (env: Env) => botCheckOf(env) },
  ],
})
export class CheckoutModule {}
