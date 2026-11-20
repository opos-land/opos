import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { SalesService } from './sales.service'

/**
 * The reports of an edition's sales, behind tickets read access to the edition
 * (docs/specs/0010-sales-reports.md). The files hold names, email addresses and answers: they go
 * to the org who asked and nowhere else, and share a rate limit an account.
 */
@Controller()
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  private exported() {
    return this.limiter.consume('salesExports', `account:${this.context.account().id}`)
  }

  @Implement(contract.sales.get)
  @RequireEdition('tickets', 'read')
  get() {
    return implement(contract.sales.get).handler(({ input }) =>
      this.sales.of(input.params.editionId),
    )
  }

  @Implement(contract.sales.ticketHolders)
  @RequireEdition('tickets', 'read')
  ticketHolders() {
    return implement(contract.sales.ticketHolders).handler(async ({ input }) => {
      await this.exported()
      return this.sales.ticketHolders(input.params.editionId, input.headers['accept-language'])
    })
  }

  @Implement(contract.sales.merchandisePickList)
  @RequireEdition('tickets', 'read')
  merchandisePickList() {
    return implement(contract.sales.merchandisePickList).handler(async ({ input }) => {
      await this.exported()
      return this.sales.merchandisePickList(
        input.params.editionId,
        input.headers['accept-language'],
      )
    })
  }

  @Implement(contract.sales.payments)
  @RequireEdition('tickets', 'read')
  payments() {
    return implement(contract.sales.payments).handler(async ({ input }) => {
      await this.exported()
      return this.sales.payments(input.params.editionId, input.headers['accept-language'])
    })
  }
}
