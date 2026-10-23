import { Controller, UseGuards } from '@nestjs/common'
import { type Account, contract } from '@opos/contract'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { CurrentAccount } from '../../common/decorators/current-account.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { GlobalDbService } from '../../common/database/global-db.service'
import { AccountsRepository } from './accounts.repository'

@Controller()
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly global: GlobalDbService,
  ) {}

  @TsRestHandler(contract.me)
  handler(@CurrentAccount() account: Account) {
    return tsRestHandler(contract.me, {
      get: () => Promise.resolve({ status: 200 as const, body: account }),
      update: async ({ body }) => ({
        status: 200,
        body: await this.accounts.updateCurrent(body),
      }),
      memberships: async () => ({
        status: 200,
        body: await this.global.ownMemberships(),
      }),
    })
  }
}
