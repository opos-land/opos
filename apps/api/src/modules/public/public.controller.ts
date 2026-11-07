import { Controller } from '@nestjs/common'
import { contract, editionSlug } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound } from '../../common/errors/api-error'
import { PublicRepository } from './public.repository'

// Without sign-in and without X-Tenant-Slug: the address names the tenant, and each request opens
// its context with withTenant.
@Controller()
export class PublicController {
  constructor(
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
    private readonly repository: PublicRepository,
  ) {}

  /** An address outside the slugs' alphabet names nothing, and must not reach a query. */
  private async tenant(slug: string) {
    if (!editionSlug.safeParse(slug).success) throw notFound('convention')
    const tenant = await this.global.tenantBySlug(slug)
    if (!tenant) throw notFound('convention')
    return tenant
  }

  private async inConvention<T>(slug: string, read: () => Promise<T>) {
    return this.context.withTenant((await this.tenant(slug)).id, read)
  }

  @Implement(contract.public.tenant)
  tenantInfo() {
    return implement(contract.public.tenant).handler(async ({ input }) => {
      const { name, defaultLocale, timezone } = await this.tenant(input.params.slug)
      return { name, defaultLocale, timezone }
    })
  }

  @Implement(contract.public.editions)
  editions() {
    return implement(contract.public.editions).handler(({ input }) =>
      this.inConvention(input.params.slug, () => this.repository.editions()),
    )
  }

  @Implement(contract.public.activeEdition)
  activeEdition() {
    return implement(contract.public.activeEdition).handler(({ input }) =>
      this.inConvention(input.params.slug, () => this.repository.activeEdition()),
    )
  }

  @Implement(contract.public.edition)
  edition() {
    return implement(contract.public.edition).handler(({ input }) =>
      this.inConvention(input.params.slug, () => this.repository.edition(input.params.editionSlug)),
    )
  }

  @Implement(contract.public.programItems)
  programItems() {
    return implement(contract.public.programItems).handler(({ input }) =>
      this.inConvention(input.params.slug, async () => {
        const edition = await this.repository.edition(input.params.editionSlug)
        return this.repository.programItems(edition.id)
      }),
    )
  }

  @Implement(contract.public.programItem)
  programItem() {
    return implement(contract.public.programItem).handler(({ input }) =>
      this.inConvention(input.params.slug, async () => {
        const edition = await this.repository.edition(input.params.editionSlug)
        return this.repository.programItem(edition.id, input.params.programItemId)
      }),
    )
  }
}
