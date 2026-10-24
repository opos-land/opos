import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { EditionsRepository } from './editions.repository'

@Controller()
export class EditionsController {
  constructor(private readonly editions: EditionsRepository) {}

  @Implement(contract.editions.list)
  @RequireTenant()
  list() {
    return implement(contract.editions.list).handler(() => this.editions.list())
  }

  @Implement(contract.editions.create)
  @RequireTenant('settings', 'write')
  create() {
    return implement(contract.editions.create).handler(({ input }) =>
      this.editions.create(input.body),
    )
  }

  @Implement(contract.editions.get)
  @RequireTenant()
  get() {
    return implement(contract.editions.get).handler(({ input }) =>
      this.editions.get(input.params.editionId),
    )
  }

  @Implement(contract.editions.update)
  @RequireTenant('settings', 'write')
  update() {
    return implement(contract.editions.update).handler(async ({ input }) => {
      const edition = await this.editions.get(input.params.editionId)
      return this.editions.update(edition.id, input.body)
    })
  }

  @Implement(contract.editions.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return implement(contract.editions.remove).handler(async ({ input }) => {
      const edition = await this.editions.get(input.params.editionId)
      await this.editions.removeInactive(edition.id)
    })
  }

  @Implement(contract.editions.activate)
  @RequireTenant('settings', 'write')
  activate() {
    return implement(contract.editions.activate).handler(async ({ input }) => {
      const edition = await this.editions.get(input.params.editionId)
      return this.editions.activate(edition.id)
    })
  }
}
