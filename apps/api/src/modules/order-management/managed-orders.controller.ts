import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { OrderReadsRepository } from './order-reads.repository'

/**
 * An edition's orders as its orgs manage them, behind the tickets permission of the edition
 * (docs/specs/0006-order-management.md).
 */
@Controller()
export class ManagedOrdersController {
  constructor(private readonly reads: OrderReadsRepository) {}

  @Implement(contract.orders.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.orders.list).handler(({ input }) =>
      this.reads.list(input.params.editionId, input.query),
    )
  }

  @Implement(contract.orders.get)
  @RequireEdition('tickets', 'read')
  get() {
    return implement(contract.orders.get).handler(({ input }) =>
      this.reads.get(input.params.editionId, input.params.orderId),
    )
  }
}
