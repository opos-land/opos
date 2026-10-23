import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { ApiError, notFound } from '../../common/errors/api-error'
import { EditionsRepository } from './editions.repository'

@Controller()
export class EditionsController {
  constructor(private readonly editions: EditionsRepository) {}

  private async edition(editionId: string) {
    const edition = await this.editions.find(editionId)
    if (!edition) throw notFound('edition')
    return edition
  }

  @TsRestHandler(contract.editions.list)
  @RequireTenant()
  list() {
    return tsRestHandler(contract.editions.list, async () => ({
      status: 200,
      body: await this.editions.list(),
    }))
  }

  @TsRestHandler(contract.editions.create)
  @RequireTenant('settings', 'write')
  create() {
    return tsRestHandler(contract.editions.create, async ({ body }) => ({
      status: 201,
      body: await this.editions.create(body),
    }))
  }

  @TsRestHandler(contract.editions.get)
  @RequireTenant()
  get() {
    return tsRestHandler(contract.editions.get, async ({ params }) => ({
      status: 200,
      body: await this.edition(params.editionId),
    }))
  }

  @TsRestHandler(contract.editions.update)
  @RequireTenant('settings', 'write')
  update() {
    return tsRestHandler(contract.editions.update, async ({ params, body }) => {
      const edition = await this.edition(params.editionId)
      if (new Date(body.endsAt ?? edition.endsAt) <= new Date(body.startsAt ?? edition.startsAt)) {
        throw new ApiError(400, 'request.invalid', 'endsAt must be after startsAt', {
          field: 'endsAt',
        })
      }
      return { status: 200, body: await this.editions.update(edition.id, body) }
    })
  }

  @TsRestHandler(contract.editions.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return tsRestHandler(contract.editions.remove, async ({ params }) => {
      const edition = await this.edition(params.editionId)
      if (edition.isActive) {
        throw new ApiError(409, 'edition.active', 'The active edition cannot be deleted')
      }
      await this.editions.remove(edition.id)
      return { status: 204, body: undefined }
    })
  }

  @TsRestHandler(contract.editions.activate)
  @RequireTenant('settings', 'write')
  activate() {
    return tsRestHandler(contract.editions.activate, async ({ params }) => {
      const edition = await this.edition(params.editionId)
      return { status: 200, body: await this.editions.activate(edition.id) }
    })
  }
}
