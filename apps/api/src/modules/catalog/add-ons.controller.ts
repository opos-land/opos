import { Controller } from '@nestjs/common'
import { type AddOn, addOnLimitIssue, contract, type UpdateAddOn } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
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
 * (docs/specs/0003-catalog.md).
 */
@Controller()
export class AddOnsController {
  constructor(
    private readonly addOns: AddOnsRepository,
    private readonly holds: HoldsRepository,
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
    })
  }
}
