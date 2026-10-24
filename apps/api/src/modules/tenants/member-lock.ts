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

/** The membership, while it exists, has not expired and holds settings=write; 403 otherwise. */
function managing(member: Member | undefined) {
  if (!member || member.expired) throw forbidden()
  const fresh = asMembership(member)
  if (decideTenant(fresh, 'settings', 'write') !== 'allow') throw forbidden()
  return fresh
}

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
  const fresh = managing(actor)
  if (!target) throw notFound('member')
  return { actor: fresh, target }
}

/**
 * For a request that adds a member: locks the actor's membership and re-checks its settings=write,
 * as lockActorAndTarget does.
 */
export async function lockActor(members: MembersRepository, actorId: string) {
  const { actor } = await members.lockPair(actorId, actorId)
  return managing(actor)
}

/** The same check as lockActor, on a read that takes no lock. */
export const currentActor = async (members: MembersRepository, actorId: string) =>
  managing(await members.find(actorId))
