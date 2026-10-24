import { type UpdateMember } from '@opos/contract'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import { ApiError } from '../../common/errors/api-error'
import { type EditionAccess, rank, tenantResources } from '../../common/permissions/permissions'

// The anti-escalation policy of PRODUCT.md 5.6. A head passes every rule except editing their own
// membership; an org with settings=write manages other orgs within their own limits.

type RefusalCode =
  | 'member.self'
  | 'member.head-only'
  | 'member.above-own'
  | 'member.expiry-after-own'
  | 'member.outlives-own'

const refuse = (code: RefusalCode, message: string) => new ApiError(403, code, message)

/**
 * Whether a new expiry makes the member's access last longer: lifting it, or moving it later, which
 * also revives an expired membership. Only an earlier or equal expiry grants nothing, so a date that
 * does not compare counts as extending.
 */
export const extendsAccess = (current: Date | null, next: Date | null) =>
  current !== null && !(next !== null && next <= current)

/** Whether access ending at `expiresAt` (`null`: never) lasts past the org's own; fails closed. */
const outlastsActor = (actor: TenantMembership, expiresAt: Date | null) =>
  actor.expiresAt !== null && !(expiresAt !== null && expiresAt <= actor.expiresAt)

export interface ManagedMember {
  id: string
  role: TenantMembership['role']
}

export type TenantLevels = Pick<
  TenantMembership,
  (typeof tenantResources)[keyof typeof tenantResources]
>

/** Nobody edits their own membership; only a head edits or removes another head. */
export function assertMayManage(actor: TenantMembership, target: ManagedMember) {
  if (actor.id === target.id) throw refuse('member.self', 'Nobody edits their own membership')
  if (target.role === 'head' && actor.role !== 'head') {
    throw refuse('member.head-only', 'Only a head edits or removes another head')
  }
}

/** Whether new tenant-level permissions put any of them above what the member holds. */
export const raisesTenantLevel = (changes: UpdateMember, current: TenantLevels) =>
  Object.values(tenantResources).some((field) => {
    const granted = changes[field]
    return granted !== undefined && rank[granted] > rank[current[field]]
  })

/** Whether new edition-level permissions put any of them above what the member holds there. */
export const raisesEditionLevel = (
  access: EditionAccess,
  current: EditionAccess | null | undefined,
) =>
  (Object.keys(access) as (keyof EditionAccess)[]).some(
    (field) => rank[access[field]] > rank[current?.[field] ?? 'none'],
  )

/**
 * An org whose access expires grants nothing that outlasts it (PRODUCT.md 5.6): it extends no one's
 * access past its own end, and raises no permission of a member whose access lasts longer. Lowering
 * a permission or shortening access is never limited by the org's own end. `current` and `next` are
 * the member's expiry before and after the change.
 */
export function assertWithinOwnExpiry(
  actor: TenantMembership,
  { current, next, raises }: { current: Date | null; next: Date | null; raises: boolean },
) {
  if (actor.role === 'head' || !actor.expiresAt) return
  if (extendsAccess(current, next) && outlastsActor(actor, next)) {
    throw refuse('member.expiry-after-own', "Extends the member's access past the actor's own")
  }
  if (raises && outlastsActor(actor, next)) {
    throw refuse('member.outlives-own', 'Raises a permission of a member who outlasts the actor')
  }
}

/**
 * An org grants no tenant-level permission above their own. A value the target already holds is no
 * grant, so an org may change one field of a member who holds more than the org elsewhere.
 */
export function assertMayGrant(
  actor: TenantMembership,
  changes: UpdateMember,
  current: TenantLevels,
) {
  if (actor.role === 'head') return
  if (changes.role === 'head') throw refuse('member.above-own', 'An org cannot appoint a head')
  for (const field of Object.values(tenantResources)) {
    const granted = changes[field]
    if (granted && granted !== current[field] && rank[granted] > rank[actor[field]]) {
      throw refuse('member.above-own', `${field} above the actor's own`)
    }
  }
}

/**
 * An org grants no edition-level permission above what they hold in that edition; a value the
 * target already holds there is no grant.
 */
export function assertMayGrantEdition(
  actor: TenantMembership,
  actorAccess: EditionAccess | null | undefined,
  access: EditionAccess,
  current: EditionAccess | null | undefined,
) {
  if (actor.role === 'head') return
  for (const [field, granted] of Object.entries(access) as [
    keyof EditionAccess,
    EditionAccess[keyof EditionAccess],
  ][]) {
    if (granted === (current?.[field] ?? 'none')) continue
    if (rank[granted] > rank[actorAccess?.[field] ?? 'none']) {
      throw refuse('member.above-own', `${field} above the actor's own`)
    }
  }
}

/**
 * Extending access (`extendsAccess`) hands the member every permission the row holds, so an org may
 * do it only for a member who holds no more than the org, on the tenant level and in every edition.
 */
export function assertMayExtend(
  actor: TenantMembership,
  actorEditions: Map<string, EditionAccess>,
  resulting: TenantLevels,
  targetEditions: Map<string, EditionAccess>,
) {
  if (actor.role === 'head') return
  for (const field of Object.values(tenantResources)) {
    if (rank[resulting[field]] > rank[actor[field]]) {
      throw refuse('member.above-own', `Extends a member holding ${field} above the actor's own`)
    }
  }
  for (const [editionId, access] of targetEditions) {
    const own = actorEditions.get(editionId)
    for (const [field, held] of Object.entries(access) as [
      keyof EditionAccess,
      EditionAccess[keyof EditionAccess],
    ][]) {
      if (rank[held] > rank[own?.[field] ?? 'none']) {
        throw refuse('member.above-own', `Extends a member holding ${field} above the actor's own`)
      }
    }
  }
}
