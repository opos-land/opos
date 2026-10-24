import { Controller, UseGuards } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AccountDeletionService } from './account-deletion.service'
import { AccountsRepository } from './accounts.repository'

@Controller()
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly context: TenantContextService,
    private readonly accounts: AccountsRepository,
    private readonly global: GlobalDbService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Implement(contract.me.get)
  get() {
    return implement(contract.me.get).handler(() => this.context.account())
  }

  @Implement(contract.me.update)
  update() {
    return implement(contract.me.update).handler(({ input }) =>
      this.accounts.updateCurrent(input.body),
    )
  }

  @Implement(contract.me.delete)
  delete() {
    return implement(contract.me.delete).handler(() => this.deletion.deleteCurrent())
  }

  @Implement(contract.me.memberships)
  memberships() {
    return implement(contract.me.memberships).handler(() => this.global.ownMemberships())
  }
}
