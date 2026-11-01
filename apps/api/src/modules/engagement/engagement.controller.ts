import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { InTenant } from '../../common/decorators/require-tenant.decorator'
import { EngagementRepository } from './engagement.repository'

@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementRepository) {}

  @Implement(contract.engagement.like)
  @InTenant()
  like() {
    return implement(contract.engagement.like).handler(({ input }) =>
      this.engagement.like(input.params.editionId, input.params.programItemId),
    )
  }

  @Implement(contract.engagement.unlike)
  @InTenant()
  unlike() {
    return implement(contract.engagement.unlike).handler(({ input }) =>
      this.engagement.unlike(input.params.editionId, input.params.programItemId),
    )
  }
}
