import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { AccessRepository } from '../../common/permissions/access.repository'
import {
  assertMayExtend,
  assertMayGrant,
  assertMayManage,
  assertWithinOwnExpiry,
  extendsAccess,
  raisesTenantLevel,
} from './anti-escalation'
import { InvitationsService } from './invitations.service'
import { lockActorAndTarget } from './member-lock'
import { MembersRepository } from './members.repository'

@Controller()
export class MembersController {
  constructor(
    private readonly context: TenantContextService,
    private readonly members: MembersRepository,
    private readonly access: AccessRepository,
    private readonly invitations: InvitationsService,
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

  @Implement(contract.tenants.members.list)
  @RequireTenant('settings', 'read')
  list() {
    return implement(contract.tenants.members.list).handler(() => this.members.list())
  }

  @Implement(contract.tenants.members.invite)
  @RequireTenant('settings', 'write')
  invite() {
    return implement(contract.tenants.members.invite).handler(({ input }) =>
      this.invitations.invite(input.body),
    )
  }

  @Implement(contract.tenants.members.update)
  @RequireTenant('settings', 'write')
  update() {
    return implement(contract.tenants.members.update).handler(async ({ input }) => {
      const { params, body } = input
      const { actor, target } = await this.lock(params.membershipId)
      assertMayGrant(actor, body, target)
      const current = target.expiresAt ? new Date(target.expiresAt) : null
      const next =
        body.expiresAt === undefined ? current : body.expiresAt ? new Date(body.expiresAt) : null
      assertWithinOwnExpiry(actor, { current, next, raises: raisesTenantLevel(body, target) })
      if (actor.role !== 'head' && extendsAccess(current, next)) {
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
      return this.members.update(target.id, target.role, body)
    })
  }

  // Removing the last head passes here and fails at COMMIT: 409 membership.last-head.
  @Implement(contract.tenants.members.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return implement(contract.tenants.members.remove).handler(async ({ input }) => {
      const { target } = await this.lock(input.params.membershipId)
      await this.members.remove(target.id)
    })
  }
}
