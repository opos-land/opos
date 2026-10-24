import { type Member } from '@opos/contract'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import { forbidden, notFound } from '../../common/errors/api-error'
import { decideTenant } from '../../common/permissions/permissions'
import { type MembersRepository } from './members.repository'

const asMembership = (member: Member): TenantMembership => ({
  id: member.id,
  role: member.role,
  settingsAccess: member.settingsAccess,
  brandingAccess: member.brandingAccess,
  shopConfigAccess: member.shopConfigAccess,
  expiresAt: member.expiresAt ? new Date(member.expiresAt) : null,
})

/**
 * For a request that changes a member: locks the actor's and the target's memberships, then
 * re-checks the actor's settings=write on the locked row, since a concurrent demotion or expiry
 * may have landed after the interceptor's check.
 */
export async function lockActorAndTarget(
  members: MembersRepository,
  actorId: string,
  targetId: string,
) {
  const { actor, target } = await members.lockPair(actorId, targetId)
  if (!actor || actor.expired) throw forbidden()
  const fresh = asMembership(actor)
  if (decideTenant(fresh, 'settings', 'write') !== 'allow') throw forbidden()
  if (!target) throw notFound('member')
  return { actor: fresh, target }
}

/**
 * For a request that adds a member: locks the actor's membership and re-checks its settings=write,
 * as lockActorAndTarget does.
 */
export async function lockActor(members: MembersRepository, actorId: string) {
  const { actor } = await members.lockPair(actorId, actorId)
  if (!actor || actor.expired) throw forbidden()
  const fresh = asMembership(actor)
  if (decideTenant(fresh, 'settings', 'write') !== 'allow') throw forbidden()
  return fresh
}
