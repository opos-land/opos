import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { AdminDbService } from './admin-db.service'
import { RequireAdmin } from './require-admin.decorator'
import { TwoFactorResetService } from './two-factor-reset.service'

// The routes of the admin application: @RequireAdmin applies JwtAuthGuard and AdminGuard. None
// opens a tenant transaction, and none grants the admin role or takes it away.
@Controller()
export class AdminController {
  constructor(
    private readonly admin: AdminDbService,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
    private readonly twoFactor: TwoFactorResetService,
  ) {}

  /** The admin of the request, after one more write on the counter the admin's writes share. */
  private async writing(): Promise<string> {
    const { id } = this.context.account()
    await this.limiter.consume('adminWrites', `account:${id}`)
    return id
  }

  @Implement(contract.admin.tenants)
  @RequireAdmin()
  tenants() {
    return implement(contract.admin.tenants).handler(() => this.admin.tenants())
  }

  @Implement(contract.admin.tenant)
  @RequireAdmin()
  tenant() {
    return implement(contract.admin.tenant).handler(({ input }) =>
      this.admin.tenant(input.params.tenantId),
    )
  }

  @Implement(contract.admin.createTenant)
  @RequireAdmin()
  createTenant() {
    return implement(contract.admin.createTenant).handler(async ({ input }) =>
      this.admin.createTenant(input.body, await this.writing()),
    )
  }

  @Implement(contract.admin.renameTenant)
  @RequireAdmin()
  renameTenant() {
    return implement(contract.admin.renameTenant).handler(async ({ input }) =>
      this.admin.renameTenant(input.params.tenantId, input.body.slug, await this.writing()),
    )
  }

  @Implement(contract.admin.suspendTenant)
  @RequireAdmin()
  suspendTenant() {
    return implement(contract.admin.suspendTenant).handler(async ({ input }) =>
      this.admin.setSuspended(input.params.tenantId, true, await this.writing()),
    )
  }

  @Implement(contract.admin.restoreTenant)
  @RequireAdmin()
  restoreTenant() {
    return implement(contract.admin.restoreTenant).handler(async ({ input }) =>
      this.admin.setSuspended(input.params.tenantId, false, await this.writing()),
    )
  }

  @Implement(contract.admin.deleteTenant)
  @RequireAdmin({ fresh: true })
  deleteTenant() {
    return implement(contract.admin.deleteTenant).handler(async ({ input }) => {
      await this.admin.deleteTenant(input.params.tenantId, await this.writing())
    })
  }

  @Implement(contract.admin.resetTwoFactor)
  @RequireAdmin({ fresh: true })
  resetTwoFactor() {
    return implement(contract.admin.resetTwoFactor).handler(async ({ input }) =>
      this.twoFactor.reset(input.body.email, await this.writing()),
    )
  }

  @Implement(contract.admin.actions)
  @RequireAdmin()
  actions() {
    return implement(contract.admin.actions).handler(({ input }) => this.admin.actions(input.query))
  }
}
