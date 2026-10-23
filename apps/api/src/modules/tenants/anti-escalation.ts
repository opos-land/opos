import { type UpdateMember } from '@opos/contract'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import { ApiError } from '../../common/errors/api-error'
import { type EditionAccess, rank, tenantResources } from '../../common/permissions/permissions'

// The anti-escalation policy of PRODUCT.md 5.6. A head passes every rule except editing their own
// membership; an org with settings=write manages other orgs within their own limits.

const refuse = (
  code: 'member.self' | 'member.head-only' | 'member.above-own' | 'member.expiry-after-own',
  message: string,
) => new ApiError(403, code, message)

export interface ManagedMember {
  id: string
  role: TenantMembership['role']
}

/** Nobody edits their own membership; only a head edits or removes another head. */
export function assertMayManage(actor: TenantMembership, target: ManagedMember) {
  if (actor.id === target.id) throw refuse('member.self', 'Nobody edits their own membership')
  if (target.role === 'head' && actor.role !== 'head') {
    throw refuse('member.head-only', 'Only a head edits or removes another head')
  }
}

/** An org grants no tenant-level permission above their own and no expiry later than their own. */
export function assertMayGrant(actor: TenantMembership, changes: UpdateMember) {
  if (actor.role === 'head') return
  if (changes.role === 'head') throw refuse('member.above-own', 'An org cannot appoint a head')
  for (const field of Object.values(tenantResources)) {
    const granted = changes[field]
    if (granted && rank[granted] > rank[actor[field]]) {
      throw refuse('member.above-own', `${field} above the actor's own`)
    }
  }
  if (changes.expiresAt !== undefined && actor.expiresAt) {
    const expiresAt = changes.expiresAt === null ? null : new Date(changes.expiresAt)
    if (!expiresAt || expiresAt > actor.expiresAt) {
      throw refuse('member.expiry-after-own', "Expiry later than the actor's own")
    }
  }
}

/** An org grants no edition-level permission above what they hold in that edition. */
export function assertMayGrantEdition(
  actor: TenantMembership,
  actorAccess: EditionAccess | null,
  access: EditionAccess,
) {
  if (actor.role === 'head') return
  for (const [field, granted] of Object.entries(access) as [
    keyof EditionAccess,
    EditionAccess[keyof EditionAccess],
  ][]) {
    if (rank[granted] > rank[actorAccess?.[field] ?? 'none']) {
      throw refuse('member.above-own', `${field} above the actor's own`)
    }
  }
}
