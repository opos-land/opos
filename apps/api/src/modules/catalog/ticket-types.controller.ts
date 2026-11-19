import { Controller } from '@nestjs/common'
import { contract, type PriceTier } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { invalidField, tiersOverlap } from './catalog.errors'
import { TicketTypesRepository } from './ticket-types.repository'

/**
 * Whether two of the tiers cover a moment together. A tier holds its start and not its end, so
 * one may end at the moment the next one starts.
 */
export function overlapping(tiers: readonly PriceTier[]): boolean {
  const windows = tiers
    .map((tier) => [Date.parse(tier.startsAt), Date.parse(tier.endsAt)] as const)
    .sort(([a], [b]) => a - b)
  return windows.some(([start], index) => index > 0 && start < windows[index - 1]![1])
}

/**
 * The ticket types of an edition, behind the tickets permission of the edition
 * (docs/specs/0003-catalog.md). A ticket type has one price at a moment or none: tiers that
 * overlap are refused here by their own code, and by the exclusion constraint of the table
 * whatever wrote the row.
 */
@Controller()
export class TicketTypesController {
  constructor(private readonly ticketTypes: TicketTypesRepository) {}

  @Implement(contract.catalog.ticketTypes.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.catalog.ticketTypes.list).handler(({ input }) =>
      this.ticketTypes.list(input.params.editionId),
    )
  }

  @Implement(contract.catalog.ticketTypes.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.catalog.ticketTypes.create).handler(async ({ input }) => {
      const { editionId } = input.params
      if (overlapping(input.body.tiers ?? [])) throw tiersOverlap()
      await this.ticketTypes.checkOffers(editionId, input.body)
      return this.ticketTypes.create(editionId, input.body)
    })
  }

  @Implement(contract.catalog.ticketTypes.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.catalog.ticketTypes.update).handler(async ({ input }) => {
      const { editionId, ticketTypeId } = input.params
      const stored = await this.ticketTypes.get(editionId, ticketTypeId)
      const {
        tiers,
        saleStartsAt = stored.saleStartsAt,
        saleEndsAt = stored.saleEndsAt,
      } = input.body
      if (Date.parse(saleEndsAt) <= Date.parse(saleStartsAt)) {
        throw invalidField('saleEndsAt', 'The sale window ends after it starts')
      }
      if (tiers && overlapping(tiers)) throw tiersOverlap()
      await this.ticketTypes.checkOffers(editionId, input.body)
      return this.ticketTypes.update(editionId, stored.id, input.body)
    })
  }

  @Implement(contract.catalog.ticketTypes.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.catalog.ticketTypes.remove).handler(async ({ input }) => {
      const { editionId, ticketTypeId } = input.params
      const stored = await this.ticketTypes.get(editionId, ticketTypeId)
      await this.ticketTypes.remove(editionId, stored.id)
    })
  }
}
