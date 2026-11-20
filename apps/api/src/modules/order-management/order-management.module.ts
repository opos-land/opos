import { Module } from '@nestjs/common'
import { ManagedOrdersController } from './managed-orders.controller'
import { OrderReadsRepository } from './order-reads.repository'

/** What an org does with an edition's orders (docs/specs/0006-order-management.md). */
@Module({
  controllers: [ManagedOrdersController],
  providers: [OrderReadsRepository],
})
export class OrderManagementModule {}
