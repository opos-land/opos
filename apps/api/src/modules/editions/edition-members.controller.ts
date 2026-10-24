import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { ApiError } from '../../common/errors/api-error'
import { AccessRepository } from '../../common/permissions/access.repository'
import {
  assertMayGrantEdition,
  assertMayManage,
  assertWithinOwnExpiry,
  raisesEditionLevel,
} from '../tenants/anti-escalation'
import { lockActorAndTarget } from '../tenants/member-lock'
import { MembersRepository } from '../tenants/members.repository'
import { EditionsRepository } from './editions.repository'
import { EditionMembersRepository } from './edition-members.repository'

@Controller()
export class EditionMembersController {
  constructor(
    private readonly context: TenantContextService,
    private readonly editions: EditionsRepository,
    private readonly members: MembersRepository,
    private readonly editionMembers: EditionMembersRepository,
    private readonly access: AccessRepository,
  ) {}

  /** Locks actor and target; the target is an org, since a head holds every edition already. */
  private async lock(tenantMembershipId: string) {
    const locked = await lockActorAndTarget(
      this.members,
      this.context.membership()!.id,
      tenantMembershipId,
    )
    assertMayManage(locked.actor, locked.target)
    if (locked.target.role === 'head') {
      throw new ApiError(409, 'member.is-head', 'A head has access to every edition')
    }
    return locked
  }

  @Implement(contract.editions.members.list)
  @RequireTenant('settings', 'read')
  list() {
    return implement(contract.editions.members.list).handler(async ({ input }) => {
      const edition = await this.editions.get(input.params.editionId)
      return this.editionMembers.list(edition.id)
    })
  }

  @Implement(contract.editions.members.put)
  @RequireTenant('settings', 'write')
  put() {
    return implement(contract.editions.members.put).handler(async ({ input }) => {
      const { params, body } = input
      const edition = await this.editions.lock(params.editionId)
      const { actor, target } = await this.lock(params.tenantMembershipId)
      const [actorAccess, current] = await Promise.all([
        this.access.editionAccess(actor.id, edition.id),
        this.access.editionAccess(target.id, edition.id),
      ])
      assertMayGrantEdition(actor, actorAccess, body, current)
      const expiry = target.expiresAt ? new Date(target.expiresAt) : null
      assertWithinOwnExpiry(actor, {
        current: expiry,
        next: expiry,
        raises: raisesEditionLevel(body, current),
      })
      return this.editionMembers.put(edition.id, target.id, body)
    })
  }

  @Implement(contract.editions.members.remove)
  @RequireTenant('settings', 'write')
  remove() {
    return implement(contract.editions.members.remove).handler(async ({ input }) => {
      const edition = await this.editions.get(input.params.editionId)
      const { target } = await this.lock(input.params.tenantMembershipId)
      await this.editionMembers.remove(edition.id, target.id)
    })
  }
}
