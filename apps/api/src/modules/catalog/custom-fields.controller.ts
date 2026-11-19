import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { CustomFieldsRepository } from './custom-fields.repository'

/**
 * The custom fields of an edition, behind the tickets permission of the edition
 * (docs/specs/0003-catalog.md): what the edition asks a ticket holder for beyond the name, the
 * email and the age band. An answer is a short text, kept with its order and never on an account.
 */
@Controller()
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsRepository) {}

  @Implement(contract.catalog.customFields.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.catalog.customFields.list).handler(({ input }) =>
      this.fields.list(input.params.editionId),
    )
  }

  @Implement(contract.catalog.customFields.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.catalog.customFields.create).handler(({ input }) =>
      this.fields.create(input.params.editionId, input.body),
    )
  }

  @Implement(contract.catalog.customFields.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.catalog.customFields.update).handler(async ({ input }) => {
      const { editionId, fieldId } = input.params
      const stored = await this.fields.get(editionId, fieldId)
      return this.fields.update(editionId, stored.id, input.body)
    })
  }

  @Implement(contract.catalog.customFields.remove)
  @RequireEdition('tickets', 'write')
  remove() {
    return implement(contract.catalog.customFields.remove).handler(async ({ input }) => {
      const { editionId, fieldId } = input.params
      const stored = await this.fields.get(editionId, fieldId)
      await this.fields.remove(editionId, stored.id)
    })
  }
}
