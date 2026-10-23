import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { AccessRepository } from '../../common/permissions/access.repository'
import {
  assertMayExtend,
  assertMayGrant,
  assertMayManage,
  assertWithinOwnExpiry,
} from './anti-escalation'
import { lockActorAndTarget } from './member-lock'
import { MembersRepository } from './members.repository'

@Controller()
export class MembersController {
  constructor(
    private readonly context: TenantContextService,
    private readonly members: MembersRepository,
    private readonly access: AccessRepository,
  ) {}

  private async lock(membershipId: string) {
    const locked = await lockActorAndTarget(
      this.members,
      this.context.membership()!.id,
      membershipId,
    )
    assertMayManage(locked.actor, locked.target)
    return locked
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
      const { actor, target } = await this.lock(params.membershipId)
      assertMayGrant(actor, body, target)
      const changesPermissions =
        body.role !== undefined ||
        body.settingsAccess !== undefined ||
        body.brandingAccess !== undefined ||
        body.shopConfigAccess !== undefined
      if (changesPermissions) {
        const expiry = body.expiresAt !== undefined ? body.expiresAt : target.expiresAt
        assertWithinOwnExpiry(actor, expiry ? new Date(expiry) : null)
      }
      if (body.expiresAt !== undefined && actor.role !== 'head') {
        const [actorEditions, targetEditions] = await Promise.all([
          this.access.editionRows(actor.id),
          this.access.editionRows(target.id),
        ])
        const resulting = {
          settingsAccess: body.settingsAccess ?? target.settingsAccess,
          brandingAccess: body.brandingAccess ?? target.brandingAccess,
          shopConfigAccess: body.shopConfigAccess ?? target.shopConfigAccess,
        }
        assertMayExtend(actor, actorEditions, resulting, targetEditions)
      }
      return { status: 200, body: await this.members.update(target.id, body) }
    })
  }

  // Removing the last head passes here and fails at COMMIT: 409 membership.last-head.
  @TsRestHandler(contract.tenants.members.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return tsRestHandler(contract.tenants.members.remove, async ({ params }) => {
      const { target } = await this.lock(params.membershipId)
      await this.members.remove(target.id)
      return { status: 204, body: undefined }
    })
  }
}
