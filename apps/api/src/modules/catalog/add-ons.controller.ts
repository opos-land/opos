import { Controller } from '@nestjs/common'
import { type AddOn, addOnLimitIssue, contract, type UpdateAddOn } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { notFound } from '../../common/errors/api-error'
import { isUuid } from '../../common/uuid'
import { FilesService } from '../files/files.service'
import { ADD_ON_PICTURE_KIND } from '../files/kinds'
import { ServesFile, TakesFile } from '../files/takes-file.decorator'
import { AddOnsRepository } from './add-ons.repository'
import { HoldsRepository } from './holds.repository'
import { invalidField } from './catalog.errors'

/**
 * What a change leaves of an add-on's limit. A kind that is no longer limited lets go of its
 * capacity and its threshold, unless the change names them itself; what then does not hold
 * together is refused.
 */
export function limitAfter(stored: AddOn, changes: UpdateAddOn): UpdateAddOn {
  const kind = changes.kind ?? stored.kind
  const cleared = changes.kind !== undefined && kind !== 'limited'
  const next = {
    ...changes,
    ...(cleared && changes.capacity === undefined && { capacity: null }),
    ...(cleared && changes.placesLeftThreshold === undefined && { placesLeftThreshold: null }),
  }
  const field = addOnLimitIssue({
    kind,
    capacity: next.capacity === undefined ? stored.capacity : next.capacity,
    placesLeftThreshold:
      next.placesLeftThreshold === undefined
        ? stored.placesLeftThreshold
        : next.placesLeftThreshold,
  })
  if (field) {
    throw invalidField(
      field,
      'A limited add-on has a capacity, and no other kind has one or a threshold',
    )
  }
  return next
}

/**
 * The add-ons of an edition, behind the tickets permission of the edition
 * (docs/specs/0003-catalog.md). An add-on has one picture, put and taken away with its file in the
 * transaction of its route.
 */
@Controller()
export class AddOnsController {
  constructor(
    private readonly addOns: AddOnsRepository,
    private readonly holds: HoldsRepository,
    private readonly files: FilesService,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.catalog.addOns.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.catalog.addOns.list).handler(({ input }) =>
      this.addOns.list(input.params.editionId),
    )
  }

  @Implement(contract.catalog.addOns.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.catalog.addOns.create).handler(({ input }) =>
      this.addOns.create(input.params.editionId, input.body),
    )
  }

  @Implement(contract.catalog.addOns.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.catalog.addOns.update).handler(async ({ input }) => {
      const { editionId, addOnId } = input.params
      const stored = await this.addOns.get(editionId, addOnId)
      const changes = limitAfter(stored, input.body)
      if (changes.capacity !== undefined) {
        await this.holds.fits('add-on', editionId, stored.id, changes.capacity)
      }
      return this.addOns.update(editionId, stored.id, changes)
    })
  }

  @Implement(contract.catalog.addOns.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.catalog.addOns.remove).handler(async ({ input }) => {
      const { editionId, addOnId } = input.params
      const stored = await this.addOns.get(editionId, addOnId)
      await this.addOns.remove(editionId, stored.id)
      // Its picture went with it: the file nothing points at any more goes in the same transaction.
      if (stored.picture) {
        await this.files.release(ADD_ON_PICTURE_KIND, stored.picture.fileId, editionId)
      }
    })
  }

  /**
   * The new picture takes the place of the old in one transaction: the old row and its file go,
   * the file just received is kept and pointed at. A rollback keeps the picture the add-on had.
   * The file was received before this transaction: when the add-on is not there nothing is kept,
   * and the sweep removes the bytes.
   */
  @Implement(contract.catalog.addOns.putPicture)
  @RequireEdition('tickets', 'write')
  @TakesFile(ADD_ON_PICTURE_KIND)
  putPicture() {
    return implement(contract.catalog.addOns.putPicture).handler(async ({ input }) => {
      const { editionId, addOnId } = input.params
      const stored = await this.addOns.get(editionId, addOnId)
      const old = await this.addOns.clearPicture(editionId, stored.id)
      if (old) await this.files.release(ADD_ON_PICTURE_KIND, old, editionId)
      const kept = await this.files.keep(this.files.received(), editionId)
      await this.addOns.setPicture(editionId, stored.id, kept.id)
      return this.addOns.get(editionId, stored.id)
    })
  }

  @Implement(contract.catalog.addOns.removePicture)
  @RequireEdition('tickets', 'write')
  removePicture() {
    return implement(contract.catalog.addOns.removePicture).handler(async ({ input }) => {
      const { editionId, addOnId } = input.params
      const stored = await this.addOns.get(editionId, addOnId)
      const fileId = await this.addOns.clearPicture(editionId, stored.id)
      if (!fileId) throw notFound('picture')
      await this.files.release(ADD_ON_PICTURE_KIND, fileId, editionId)
    })
  }

  /**
   * The picture of an add-on for the edition's orgs, of a hidden add-on and of an unpublished
   * edition too: what they are setting up before anyone else sees it. Only a file an add-on of
   * this edition points at is read; the check runs in a short transaction of the tenant, and the
   * storage is then read outside every transaction. No cache keeps the answer.
   */
  @Implement(contract.catalog.addOns.file)
  @RequireEdition('tickets', 'read')
  @ServesFile()
  file() {
    return implement(contract.catalog.addOns.file).handler(async ({ input }) => {
      const { editionId, fileId, variant } = input.params
      if (!isUuid(fileId)) throw notFound('file')
      const found = await this.context.withTenant(this.context.tenant().id, () =>
        this.addOns.pictureFile(editionId, fileId),
      )
      if (!found) throw notFound('file')
      const file = await this.files.open(ADD_ON_PICTURE_KIND, found, { variant, editionId })
      return this.files.answer(file, { forEveryone: false })
    })
  }
}
