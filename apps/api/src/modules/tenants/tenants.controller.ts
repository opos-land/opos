import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'

// Tenant routes: @RequireTenant applies JwtAuthGuard itself.
@Controller()
export class TenantsController {
  constructor(private readonly context: TenantContextService) {}

  @TsRestHandler(contract.tenants.current)
  @RequireTenant()
  current() {
    return tsRestHandler(contract.tenants.current, () =>
      Promise.resolve({ status: 200 as const, body: this.context.tenant() }),
    )
  }
}
