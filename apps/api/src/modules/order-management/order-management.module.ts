import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module'
import { CheckoutModule } from '../checkout/checkout.module'
import { ManagedOrdersController } from './managed-orders.controller'
import { ManagedOrdersRepository } from './managed-orders.repository'
import { ManualOrders } from './manual-orders.service'
import { OrderCorrections } from './order-corrections.service'
import { OrderHandOuts } from './order-hand-outs.service'
import { OrderReadsRepository } from './order-reads.repository'
import { OrderSettling } from './order-settling.service'
import { ProductionNumbersService } from './production-numbers.service'

/** What an org does with an edition's orders (docs/specs/0006-order-management.md). */
@Module({
  imports: [CheckoutModule, CatalogModule],
  controllers: [ManagedOrdersController],
  providers: [
    OrderReadsRepository,
    ManagedOrdersRepository,
    OrderCorrections,
    OrderSettling,
    ManualOrders,
    OrderHandOuts,
    ProductionNumbersService,
  ],
})
export class OrderManagementModule {}
