import { Controller } from '@nestjs/common'
import { contract, editionListPlace, editionSlug } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound, suspendedAsNotFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'
import { LogoRepository } from '../branding/logo.repository'
import { FilesService } from '../files/files.service'
import { DOCUMENT_KIND, LOGO_KIND } from '../files/kinds'
import { DocumentsRepository } from '../shop/documents.repository'
import { PublicRepository } from './public.repository'

// Without sign-in and without X-Tenant-Slug: the address names the tenant, and each request opens
// its context with withTenant.
@Controller()
export class PublicController {
  constructor(
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
    private readonly repository: PublicRepository,
    private readonly logos: LogoRepository,
    private readonly files: FilesService,
    private readonly documents: DocumentsRepository,
  ) {}

  /**
   * An address outside the slugs' alphabet names nothing, and must not reach a query. A suspended
   * convention is not found, as an unknown address is.
   */
  private async tenant(slug: string) {
    if (!editionSlug.safeParse(slug).success) throw notFound('convention')
    const found = await this.global.tenantBySlug(slug)
    if (!found || found.suspended) throw notFound('convention')
    return found.tenant
  }

  private async inConvention<T>(slug: string, read: () => Promise<T>) {
    return this.context
      .withTenant((await this.tenant(slug)).id, read)
      .catch(suspendedAsNotFound('convention'))
  }

  @Implement(contract.public.tenant)
  tenantInfo() {
    return implement(contract.public.tenant).handler(async ({ input }) => {
      const { id, name, defaultLocale, timezone } = await this.tenant(input.params.slug)
      const logo = await this.context
        .withTenant(id, () => this.logos.find(id))
        .catch(suspendedAsNotFound('convention'))
      return { name, defaultLocale, timezone, logo }
    })
  }

  /**
   * The list of editions on the portal's home page, read across conventions. A full page names
   * the place of its last row, by the moment its part is ordered by, for the next one to continue
   * from.
   */
  @Implement(contract.public.editionList)
  editionList() {
    return implement(contract.public.editionList).handler(async ({ input }) => {
      const { period, limit } = input.query
      const after = input.query.after ? editionListPlace.read(input.query.after) : null
      const editions = await this.global.listedEditions({
        period,
        limit,
        after: after ?? undefined,
      })
      const last = editions.length < limit ? undefined : editions.at(-1)
      return {
        editions,
        next: last
          ? editionListPlace.write(
              new Date(period === 'coming' ? last.startsAt : last.endsAt),
              last.id,
            )
          : null,
      }
    })
  }

  /**
   * A variant of the convention's logo, for anyone. Only the file the logo points at now is read:
   * a replaced one, another convention's and any file of another kind are not found. The check
   * runs in a short transaction of the tenant; the storage is then read outside every transaction,
   * as the tenant the address named, which the request store never holds: nobody was admitted to
   * it.
   */
  @Implement(contract.public.logoFile)
  logoFile() {
    return implement(contract.public.logoFile).handler(async ({ input }) => {
      const { slug, fileId, variant } = input.params
      const tenant = await this.tenant(slug)
      if (!isUuid(fileId)) throw notFound('file')
      const logo = await this.context
        .withTenant(tenant.id, () => this.logos.find(tenant.id))
        .catch(suspendedAsNotFound('convention'))
      if (logo?.fileId !== fileId) throw notFound('file')
      const file = await this.files
        .open(LOGO_KIND, fileId, { variant, tenantId: tenant.id })
        .catch(suspendedAsNotFound('convention'))
      return this.files.answer(file, { forEveryone: true })
    })
  }

  /**
   * A published version of a legal document, for anyone, as a download: a buyer reads what they
   * accepted for as long as the convention is on the platform. The edition's publication does not
   * bind it, in either direction: a version is readable by its address from the moment it is
   * published, whether its edition is published, was, or never was, and also once its document
   * is hidden. Only a file a version of this convention points at is read; the check runs in a
   * short transaction of the tenant, and the storage is then read outside every transaction, as
   * the tenant the address named. No cache keeps the answer, so a deleted document and a suspended
   * convention stop answering at once.
   */
  @Implement(contract.public.documentVersion)
  documentVersion() {
    return implement(contract.public.documentVersion).handler(async ({ input }) => {
      const { slug, versionId } = input.params
      const tenant = await this.tenant(slug)
      if (!isUuid(versionId)) throw notFound('document version')
      const version = await this.context
        .withTenant(tenant.id, () => this.documents.versionFile(tenant.id, versionId))
        .catch(suspendedAsNotFound('convention'))
      if (!version) throw notFound('document version')
      const file = await this.files
        .open(DOCUMENT_KIND, version.fileId, { editionId: version.editionId, tenantId: tenant.id })
        .catch(suspendedAsNotFound('convention'))
      return this.files.answer(file, { forEveryone: false })
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
