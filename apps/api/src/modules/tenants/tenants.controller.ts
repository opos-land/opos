import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { TenantsRepository } from './tenants.repository'

// Tenant routes: @RequireTenant applies JwtAuthGuard itself.
@Controller()
export class TenantsController {
  constructor(
    private readonly context: TenantContextService,
    private readonly tenants: TenantsRepository,
  ) {}

  @Implement(contract.tenants.current)
  @RequireTenant()
  current() {
    return implement(contract.tenants.current).handler(() => this.context.tenant())
  }

  @Implement(contract.tenants.update)
  @RequireTenant('settings', 'write')
  update() {
    return implement(contract.tenants.update).handler(({ input }) =>
      this.tenants.update(input.body),
    )
  }
}
