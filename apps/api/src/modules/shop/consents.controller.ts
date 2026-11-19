import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { notFound } from '../../common/errors/api-error'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { ConsentsRepository } from './consents.repository'
import { DocumentsRepository } from './documents.repository'

/**
 * The consents of an edition, behind the tickets permission of the edition
 * (docs/specs/0002-shop-setup.md): their wording is the convention's, and OPOS marks none as
 * required by itself.
 */
@Controller()
export class ConsentsController {
  constructor(
    private readonly consents: ConsentsRepository,
    private readonly documents: DocumentsRepository,
  ) {}

  /** A new consent links a document of its own edition, or none, and links it for good. */
  private async checkDocument(editionId: string, documentId: string | null | undefined) {
    if (documentId == null) return
    if (!(await this.documents.holds(editionId, documentId))) throw notFound('document')
  }

  @Implement(contract.shop.consents.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.shop.consents.list).handler(({ input }) =>
      this.consents.list(input.params.editionId),
    )
  }

  @Implement(contract.shop.consents.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.shop.consents.create).handler(async ({ input }) => {
      const { editionId } = input.params
      await this.checkDocument(editionId, input.body.documentId)
      return this.consents.create(editionId, input.body)
    })
  }

  @Implement(contract.shop.consents.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.shop.consents.update).handler(async ({ input }) => {
      const { editionId, consentId } = input.params
      const consent = await this.consents.get(editionId, consentId)
      return this.consents.update(editionId, consent.id, input.body)
    })
  }

  @Implement(contract.shop.consents.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.shop.consents.remove).handler(async ({ input }) => {
      const { editionId, consentId } = input.params
      const consent = await this.consents.get(editionId, consentId)
      await this.consents.remove(editionId, consent.id)
    })
  }
}
