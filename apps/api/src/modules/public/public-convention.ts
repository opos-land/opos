import { Injectable } from '@nestjs/common'
import { editionSlug } from '@opos/contract'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound, suspendedAsNotFound } from '../../common/errors/api-error'

/**
 * The convention a public address names. A route without sign-in and without X-Tenant-Slug finds
 * its tenant here and opens its context with `within`: an address outside the slugs' alphabet
 * names nothing and reaches no query, and a suspended convention is not found, as an unknown
 * address is, also when it is suspended while the request runs.
 */
@Injectable()
export class PublicConvention {
  constructor(
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
  ) {}

  /** The tenant of the slug, or 404. */
  async tenant(slug: string) {
    if (!editionSlug.safeParse(slug).success) throw notFound('convention')
    const found = await this.global.tenantBySlug(slug)
    if (!found || found.suspended) throw notFound('convention')
    return found.tenant
  }

  /** Runs `read` in a transaction of the tenant the slug names. */
  async within<T>(slug: string, read: (tenant: { id: string }) => Promise<T>): Promise<T> {
    const tenant = await this.tenant(slug)
    return this.context
      .withTenant(tenant.id, () => read(tenant))
      .catch(suspendedAsNotFound('convention'))
  }
}
