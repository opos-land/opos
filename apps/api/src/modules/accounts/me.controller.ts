import { Controller, Inject, Req, UseGuards } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { applicationFromOrigin } from '../../common/http/application'
import { ENV, type Env } from '../../config/env'
import {
  clearSessionCookies,
  type CookieRequest,
  type CookieResponse,
} from '../auth/session-cookies'
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
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Implement(contract.me.get)
  get() {
    return implement(contract.me.get).handler(() => ({
      ...this.context.account(),
      signInMethods: this.context.signInMethods(),
    }))
  }

  @Implement(contract.me.update)
  update() {
    return implement(contract.me.update).handler(({ input }) =>
      this.accounts.updateCurrent(input.body),
    )
  }

  @Implement(contract.me.delete)
  delete(@Req() req: CookieRequest & { res: CookieResponse }) {
    return implement(contract.me.delete).handler(async () => {
      await this.deletion.deleteCurrent()
      // The session died with the account: the pair of the calling application goes (PLAN.md 5.2).
      // A Bearer call without the Origin of an application has no cookies to clear.
      const app = applicationFromOrigin(req.headers.origin, this.env)
      if (app) clearSessionCookies(req.res, app, this.env)
    })
  }

  @Implement(contract.me.memberships)
  memberships() {
    return implement(contract.me.memberships).handler(() => this.global.ownMemberships())
  }

  @Implement(contract.me.schedule)
  schedule() {
    return implement(contract.me.schedule).handler(() => this.global.ownSchedule())
  }
}
