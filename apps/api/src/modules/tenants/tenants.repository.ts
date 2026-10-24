import { Injectable } from '@nestjs/common'
import { type Tenant, type UpdateTenant } from '@opos/contract'
import { tenants } from '@opos/db'
import { eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

@Injectable()
export class TenantsRepository {
  constructor(private readonly context: TenantContextService) {}

  async update(changes: UpdateTenant): Promise<Tenant> {
    const current = this.context.tenant()
    if (Object.keys(changes).length === 0) return current
    const [row] = await this.context
      .tx()
      .update(tenants)
      .set(changes)
      .where(eq(tenants.id, current.id))
      .returning({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        defaultLocale: tenants.defaultLocale,
        timezone: tenants.timezone,
      })
    return row!
  }
}
