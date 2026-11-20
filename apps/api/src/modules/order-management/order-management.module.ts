import { Module } from '@nestjs/common'
import { CheckoutModule } from '../checkout/checkout.module'
import { ManagedOrdersController } from './managed-orders.controller'
import { ManagedOrdersRepository } from './managed-orders.repository'
import { OrderCorrections } from './order-corrections.service'
import { OrderReadsRepository } from './order-reads.repository'
import { OrderSettling } from './order-settling.service'

/** What an org does with an edition's orders (docs/specs/0006-order-management.md). */
@Module({
  imports: [CheckoutModule],
  controllers: [ManagedOrdersController],
  providers: [OrderReadsRepository, ManagedOrdersRepository, OrderCorrections, OrderSettling],
})
export class OrderManagementModule {}
