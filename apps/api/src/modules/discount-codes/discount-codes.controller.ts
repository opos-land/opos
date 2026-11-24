import { Controller } from '@nestjs/common'
import { contract, discountValueIssue } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { ApiError } from '../../common/errors/api-error'
import { invalidField } from '../catalog/catalog.errors'
import { type AppliesTo, DiscountCodesRepository } from './discount-codes.repository'

/** A limit is never set below the uses orders already hold of the code. */
const belowHeld = (held: number) =>
  new ApiError(409, 'catalog.below-held', 'Orders hold more than the limit', { held })

/**
 * The discount codes of an edition, behind the tickets permission of the edition
 * (docs/specs/0008-discount-codes.md, D1-D6).
 */
@Controller()
export class DiscountCodesController {
  constructor(
    private readonly codes: DiscountCodesRepository,
    private readonly context: TenantContextService,
  ) {}

  /** A code applies to the catalog of its own edition alone. */
  private async checkApplies(editionId: string, applies: AppliesTo) {
    const field = await this.codes.ofEdition(editionId, applies)
    if (field) throw invalidField(field, 'A code applies to the catalog of its own edition')
  }

  @Implement(contract.discountCodes.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.discountCodes.list).handler(({ input }) =>
      this.codes.list(input.params.editionId),
    )
  }

  @Implement(contract.discountCodes.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.discountCodes.create).handler(async ({ input }) => {
      const { editionId } = input.params
      const { ticketTypeIds, addOnIds, itemIds, validFrom, validUntil, ...terms } = input.body
      const applies = { ticketTypeIds, addOnIds, itemIds }
      await this.checkApplies(editionId, applies)
      // A window left out runs from the moment the code is made until its edition ends.
      const from = validFrom ? new Date(validFrom) : new Date()
      const until = validUntil ? new Date(validUntil) : await this.codes.editionEnd(editionId)
      if (until.getTime() <= from.getTime()) {
        throw invalidField('validUntil', 'The window ends after it starts')
      }
      const tenantId = this.context.tenant().id
      const id = await this.codes.insert(tenantId, editionId, {
        ...terms,
        validFrom: from,
        validUntil: until,
      })
      await this.codes.apply(tenantId, editionId, id, applies)
      return this.codes.get(editionId, id)
    })
  }

  /**
   * Changes a code under the lock of its row, as an order that takes a use of it locks it: the
   * limit is judged against the uses orders hold at that moment.
   */
  @Implement(contract.discountCodes.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.discountCodes.update).handler(async ({ input }) => {
      const { editionId, codeId } = input.params
      const { ticketTypeIds, addOnIds, itemIds, ended, validFrom, validUntil, ...terms } =
        input.body
      const stored = await this.codes.locked(editionId, codeId)
      // A code that changes its kind lets go of the other kind's value, unless the change names it.
      const kind = terms.kind ?? stored.kind
      const next = {
        kind,
        percent:
          terms.percent !== undefined ? terms.percent : kind === 'percent' ? stored.percent : null,
        amountMinor:
          terms.amountMinor !== undefined
            ? terms.amountMinor
            : kind === 'amount'
              ? stored.amountMinor
              : null,
      }
      const field = discountValueIssue(next)
      if (field) {
        throw invalidField(field, 'A percent code has a percent and an amount code an amount')
      }
      const from = validFrom ? new Date(validFrom) : stored.validFrom
      const until = validUntil ? new Date(validUntil) : stored.validUntil
      if (until.getTime() <= from.getTime()) {
        throw invalidField('validUntil', 'The window ends after it starts')
      }
      if (terms.usageLimit !== undefined && terms.usageLimit !== null) {
        const held = await this.codes.uses(stored.id)
        if (held > terms.usageLimit) throw belowHeld(held)
      }
      const applies = { ticketTypeIds, addOnIds, itemIds }
      await this.checkApplies(editionId, applies)
      await this.codes.change(editionId, stored.id, {
        ...(terms.code !== undefined && { code: terms.code }),
        ...next,
        ...(terms.usageLimit !== undefined && { usageLimit: terms.usageLimit }),
        validFrom: from,
        validUntil: until,
        ...(ended !== undefined && { endedAt: ended ? (stored.endedAt ?? new Date()) : null }),
      })
      await this.codes.apply(this.context.tenant().id, editionId, stored.id, applies)
      return this.codes.get(editionId, stored.id)
    })
  }

  @Implement(contract.discountCodes.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.discountCodes.remove).handler(async ({ input }) => {
      await this.codes.remove(input.params.editionId, input.params.codeId)
    })
  }
}
