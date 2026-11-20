import { Controller } from '@nestjs/common'
import { contract, type DocumentKind, REQUIRED_DOCUMENT_KINDS } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { FilesService } from '../files/files.service'
import { DOCUMENT_KIND } from '../files/kinds'
import { TakesFile } from '../files/takes-file.decorator'
import { DocumentsRepository } from './documents.repository'
import { EditionShopsRepository } from './edition-shops.repository'
import { documentInUse, shopOpen } from './shop.errors'

const isRequired = (kind: DocumentKind) =>
  (REQUIRED_DOCUMENT_KINDS as readonly DocumentKind[]).includes(kind)

/**
 * The legal documents of an edition and their versions, behind the tickets permission of the
 * edition (docs/specs/0002-shop-setup.md). A version is a file published once: no route changes
 * or removes one, and it goes only with its document.
 */
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsRepository,
    private readonly shops: EditionShopsRepository,
    private readonly files: FilesService,
  ) {}

  /**
   * While the shop is open, the edition keeps a published version of each kind opening asks for:
   * the last document that stands for such a kind is neither hidden nor deleted.
   */
  private async keepOpenShopReady(editionId: string, document: { id: string; kind: DocumentKind }) {
    if (!isRequired(document.kind)) return
    if ((await this.shops.find(editionId)).openedAt === null) return
    const left = await this.documents.publishedKinds(editionId, document.id)
    if (!left.has(document.kind)) throw shopOpen()
  }

  @Implement(contract.shop.documents.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.shop.documents.list).handler(({ input }) =>
      this.documents.list(input.params.editionId),
    )
  }

  @Implement(contract.shop.documents.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.shop.documents.create).handler(({ input }) =>
      this.documents.create(input.params.editionId, input.body),
    )
  }

  @Implement(contract.shop.documents.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.shop.documents.update).handler(async ({ input }) => {
      const { editionId, documentId } = input.params
      const document = await this.documents.get(editionId, documentId)
      if (input.body.hidden && !document.hidden) await this.keepOpenShopReady(editionId, document)
      return this.documents.update(editionId, document.id, input.body)
    })
  }

  /**
   * The file was received before this transaction, which keeps it and publishes it as the
   * document's next version; when the document is not there, or holds the most it can, nothing is
   * kept and the sweep removes the bytes.
   */
  @Implement(contract.shop.documents.publishVersion)
  @RequireEdition('tickets', 'write')
  @TakesFile(DOCUMENT_KIND)
  publishVersion() {
    return implement(contract.shop.documents.publishVersion).handler(async ({ input }) => {
      const { editionId, documentId } = input.params
      const document = await this.documents.get(editionId, documentId)
      const kept = await this.files.keep(this.files.received(), editionId)
      await this.documents.publish(editionId, document.id, kept.id)
      return this.documents.get(editionId, document.id)
    })
  }

  /** The versions go with the document, and their files with them, in one transaction. */
  @Implement(contract.shop.documents.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.shop.documents.remove).handler(async ({ input }) => {
      const { editionId, documentId } = input.params
      const document = await this.documents.get(editionId, documentId)
      if (await this.documents.linked(document.id)) throw documentInUse()
      await this.keepOpenShopReady(editionId, document)
      for (const fileId of await this.documents.remove(editionId, document.id)) {
        await this.files.release(DOCUMENT_KIND, fileId, editionId)
      }
    })
  }
}
