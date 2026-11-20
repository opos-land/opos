import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { ManualOrders } from './manual-orders.service'
import { OrderCorrections } from './order-corrections.service'
import { OrderHandOuts } from './order-hand-outs.service'
import { OrderReadsRepository } from './order-reads.repository'
import { OrderSettling } from './order-settling.service'
import { ProductionNumbersService } from './production-numbers.service'

/**
 * An edition's orders as its orgs manage them, behind the tickets permission of the edition
 * (docs/specs/0006-order-management.md).
 */
@Controller()
export class ManagedOrdersController {
  constructor(
    private readonly reads: OrderReadsRepository,
    private readonly corrections: OrderCorrections,
    private readonly settling: OrderSettling,
    private readonly manual: ManualOrders,
    private readonly handOuts: OrderHandOuts,
    private readonly production: ProductionNumbersService,
    private readonly context: TenantContextService,
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

  @Implement(contract.orders.emails)
  @RequireEdition('tickets', 'read')
  emails() {
    return implement(contract.orders.emails).handler(({ input }) =>
      this.reads.emails(input.params.editionId, input.query),
    )
  }

  @Implement(contract.orders.email)
  @RequireEdition('tickets', 'read')
  email() {
    return implement(contract.orders.email).handler(({ input }) =>
      this.reads.email(input.params.editionId, input.params.emailId),
    )
  }

  @Implement(contract.orders.createManual)
  @RequireEdition('tickets', 'write')
  createManual() {
    return implement(contract.orders.createManual).handler(async ({ input }) => {
      const { editionId } = input.params
      const orderId = await this.manual.record(this.context.tenant().id, editionId, input.body)
      return this.reads.get(editionId, orderId)
    })
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

  @Implement(contract.orders.cancel)
  @RequireEdition('tickets', 'write')
  cancel() {
    return implement(contract.orders.cancel).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.settling.cancel(editionId, orderId, input.body.reason)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.markPaid)
  @RequireEdition('tickets', 'write')
  markPaid() {
    return implement(contract.orders.markPaid).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.settling.markPaid(editionId, orderId)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.decline)
  @RequireEdition('tickets', 'write')
  decline() {
    return implement(contract.orders.decline).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.settling.decline(editionId, orderId, input.body.reason)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.resendConfirmation)
  @RequireEdition('tickets', 'write')
  resendConfirmation() {
    return implement(contract.orders.resendConfirmation).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.handOuts.resend(editionId, orderId)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.handOut)
  @RequireEdition('tickets', 'write')
  handOut() {
    return implement(contract.orders.handOut).handler(async ({ input }) => {
      const { editionId, orderId } = input.params
      await this.handOuts.handOut(editionId, orderId, input.body.lineIds)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.takeBackHandOut)
  @RequireEdition('tickets', 'write')
  takeBackHandOut() {
    return implement(contract.orders.takeBackHandOut).handler(async ({ input }) => {
      const { editionId, orderId, lineId } = input.params
      await this.handOuts.takeBack(editionId, orderId, lineId)
      return this.reads.get(editionId, orderId)
    })
  }

  @Implement(contract.orders.productionNumbers)
  @RequireEdition('tickets', 'read')
  productionNumbers() {
    return implement(contract.orders.productionNumbers).handler(({ input }) =>
      this.production.of(input.params.editionId),
    )
  }

  @Implement(contract.orders.productionNumbersExport)
  @RequireEdition('tickets', 'read')
  productionNumbersExport() {
    return implement(contract.orders.productionNumbersExport).handler(({ input }) =>
      this.production.file(input.params.editionId, input.headers['accept-language']),
    )
  }
}
