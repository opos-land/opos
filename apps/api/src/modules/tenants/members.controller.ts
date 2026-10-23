import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { notFound } from '../../common/errors/api-error'
import { assertMayGrant, assertMayManage } from './anti-escalation'
import { MembersRepository } from './members.repository'

@Controller()
export class MembersController {
  constructor(
    private readonly context: TenantContextService,
    private readonly members: MembersRepository,
  ) {}

  private async target(membershipId: string) {
    const target = await this.members.find(membershipId)
    if (!target) throw notFound('member')
    assertMayManage(this.context.membership()!, target)
    return target
  }

  @TsRestHandler(contract.tenants.members.list)
  @RequireTenant('settings', 'read')
  list() {
    return tsRestHandler(contract.tenants.members.list, async () => ({
      status: 200,
      body: await this.members.list(),
    }))
  }

  @TsRestHandler(contract.tenants.members.update)
  @RequireTenant('settings', 'write')
  update() {
    return tsRestHandler(contract.tenants.members.update, async ({ params, body }) => {
      const target = await this.target(params.membershipId)
      assertMayGrant(this.context.membership()!, body)
      return { status: 200, body: await this.members.update(target.id, body) }
    })
  }

  // Removing the last head passes here and fails at COMMIT: 409 membership.last-head.
  @TsRestHandler(contract.tenants.members.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return tsRestHandler(contract.tenants.members.remove, async ({ params }) => {
      const target = await this.target(params.membershipId)
      await this.members.remove(target.id)
      return { status: 204, body: undefined }
    })
  }
}
