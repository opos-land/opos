import { Controller } from '@nestjs/common'
import { contract, type MerchandiseItem } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'
import { FilesService } from '../files/files.service'
import { PICTURE_KIND, SIZE_CHART_KIND } from '../files/kinds'
import { ServesFile, TakesFile } from '../files/takes-file.decorator'
import { MerchandiseRepository } from './merchandise.repository'

const hasValue = (item: MerchandiseItem, valueId: string) =>
  item.axes.some((axis) => axis.values.some((value) => value.id === valueId))

/**
 * The merchandise of an edition, behind the tickets permission of the edition
 * (docs/specs/0003-catalog.md): items with their option axes, the variants that exist, their
 * stock, their pictures and the size charts of their values. A picture and a size chart are
 * added and removed one at a time, each with its file, in the transaction of its route.
 */
@Controller()
export class MerchandiseController {
  constructor(
    private readonly items: MerchandiseRepository,
    private readonly files: FilesService,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.catalog.merchandise.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.catalog.merchandise.list).handler(({ input }) =>
      this.items.list(input.params.editionId),
    )
  }

  @Implement(contract.catalog.merchandise.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.catalog.merchandise.create).handler(({ input }) =>
      this.items.create(input.params.editionId, input.body),
    )
  }

  /** The size charts of the values a change of the axes takes away go with them. */
  @Implement(contract.catalog.merchandise.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.catalog.merchandise.update).handler(async ({ input }) => {
      const { editionId, itemId } = input.params
      const item = await this.items.get(editionId, itemId)
      const { axes, pictureIds, ...fields } = input.body
      await this.items.update(editionId, item.id, fields)
      if (axes) {
        for (const fileId of await this.items.setAxes(item, axes)) {
          await this.files.release(SIZE_CHART_KIND, fileId, editionId)
        }
      }
      if (pictureIds) await this.items.orderPictures(item, pictureIds)
      return this.items.get(editionId, item.id)
    })
  }

  /** The item goes with its pictures and size charts, and their files, in one transaction. */
  @Implement(contract.catalog.merchandise.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.catalog.merchandise.remove).handler(async ({ input }) => {
      const { editionId, itemId } = input.params
      const released = await this.items.remove(await this.items.get(editionId, itemId))
      for (const fileId of released.pictures) {
        await this.files.release(PICTURE_KIND, fileId, editionId)
      }
      for (const fileId of released.sizeCharts) {
        await this.files.release(SIZE_CHART_KIND, fileId, editionId)
      }
    })
  }

  @Implement(contract.catalog.merchandise.putVariants)
  @RequireEdition('tickets', 'write')
  putVariants() {
    return implement(contract.catalog.merchandise.putVariants).handler(async ({ input }) => {
      const { editionId, itemId } = input.params
      const item = await this.items.get(editionId, itemId)
      await this.items.putVariants(item, input.body)
      return this.items.get(editionId, item.id)
    })
  }

  @Implement(contract.catalog.merchandise.putStock)
  @RequireEdition('tickets', 'write')
  putStock() {
    return implement(contract.catalog.merchandise.putStock).handler(async ({ input }) => {
      const { editionId, itemId, variantId } = input.params
      const item = await this.items.get(editionId, itemId)
      if (!(await this.items.putStock(item, variantId, input.body.stock))) {
        throw notFound('variant')
      }
      return this.items.get(editionId, item.id)
    })
  }

  /**
   * The file was received before this transaction, which keeps it and adds it as the item's last
   * picture; when the item is not there, or holds the most it can, nothing is kept and the sweep
   * removes the bytes.
   */
  @Implement(contract.catalog.merchandise.addPicture)
  @RequireEdition('tickets', 'write')
  @TakesFile(PICTURE_KIND)
  addPicture() {
    return implement(contract.catalog.merchandise.addPicture).handler(async ({ input }) => {
      const { editionId, itemId } = input.params
      const item = await this.items.get(editionId, itemId)
      this.items.roomForPicture(item)
      const kept = await this.files.keep(this.files.received(), editionId)
      await this.items.addPicture(item, kept.id)
      return this.items.get(editionId, item.id)
    })
  }

  @Implement(contract.catalog.merchandise.removePicture)
  @RequireEdition('tickets', 'write')
  removePicture() {
    return implement(contract.catalog.merchandise.removePicture).handler(async ({ input }) => {
      const { editionId, itemId, pictureId } = input.params
      const item = await this.items.get(editionId, itemId)
      const fileId = await this.items.removePicture(item, pictureId)
      if (!fileId) throw notFound('picture')
      await this.files.release(PICTURE_KIND, fileId, editionId)
    })
  }

  /**
   * The new size chart takes the place of the old in one transaction: the old row and its file
   * go, the file just received is kept and pointed at. A rollback keeps the chart the value had.
   */
  @Implement(contract.catalog.merchandise.putSizeChart)
  @RequireEdition('tickets', 'write')
  @TakesFile(SIZE_CHART_KIND)
  putSizeChart() {
    return implement(contract.catalog.merchandise.putSizeChart).handler(async ({ input }) => {
      const { editionId, itemId, valueId } = input.params
      const item = await this.items.get(editionId, itemId)
      if (!hasValue(item, valueId)) throw notFound('option value')
      const old = await this.items.clearSizeChart(valueId)
      if (old) await this.files.release(SIZE_CHART_KIND, old, editionId)
      const kept = await this.files.keep(this.files.received(), editionId)
      await this.items.setSizeChart(editionId, valueId, kept.id)
      return this.items.get(editionId, item.id)
    })
  }

  @Implement(contract.catalog.merchandise.removeSizeChart)
  @RequireEdition('tickets', 'write')
  removeSizeChart() {
    return implement(contract.catalog.merchandise.removeSizeChart).handler(async ({ input }) => {
      const { editionId, itemId, valueId } = input.params
      const item = await this.items.get(editionId, itemId)
      const fileId = hasValue(item, valueId) ? await this.items.clearSizeChart(valueId) : undefined
      if (!fileId) throw notFound('size chart')
      await this.files.release(SIZE_CHART_KIND, fileId, editionId)
    })
  }

  /**
   * A picture or a size chart for the edition's orgs, of a hidden item and of an unpublished
   * edition too: what they are setting up before anyone else sees it. Only a file an item of
   * this edition points at is read; the check runs in a short transaction of the tenant, and the
   * storage is then read outside every transaction. No cache keeps the answer.
   */
  @Implement(contract.catalog.merchandise.file)
  @RequireEdition('tickets', 'read')
  @ServesFile()
  file() {
    return implement(contract.catalog.merchandise.file).handler(async ({ input }) => {
      const { editionId, fileId, variant } = input.params
      if (!isUuid(fileId)) throw notFound('file')
      const kind = await this.context.withTenant(this.context.tenant().id, () =>
        this.items.fileKind(editionId, fileId),
      )
      if (!kind) throw notFound('file')
      const file = await this.files.open(kind, fileId, { variant, editionId })
      return this.files.answer(file, { forEveryone: false })
    })
  }
}
