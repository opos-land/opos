import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { OrderCorrections } from './order-corrections.service'
import { OrderReadsRepository } from './order-reads.repository'

/**
 * An edition's orders as its orgs manage them, behind the tickets permission of the edition
 * (docs/specs/0006-order-management.md).
 */
@Controller()
export class ManagedOrdersController {
  constructor(
    private readonly reads: OrderReadsRepository,
    private readonly corrections: OrderCorrections,
  ) {}

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

  @Implement(contract.orders.updateHolder)
  @RequireEdition('tickets', 'write')
  updateHolder() {
    return implement(contract.orders.updateHolder).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.corrections.holder(editionId, orderId, input.body.holderName)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.changeEmail)
  @RequireEdition('tickets', 'write')
  changeEmail() {
    return implement(contract.orders.changeEmail).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.corrections.email(editionId, orderId, input.body.email)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.swapVariant)
  @RequireEdition('tickets', 'write')
  swapVariant() {
    return implement(contract.orders.swapVariant).handler(async ({ input }) => {
      const { editionId, orderId, lineId } = input.params
      await this.corrections.variant(editionId, orderId, lineId, input.body.variantId)
      return this.reads.get(editionId, orderId)
    })
  }
}
